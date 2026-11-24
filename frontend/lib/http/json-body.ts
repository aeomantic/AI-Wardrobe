export class RequestBodyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RequestBodyError";
  }
}

/**
 * Reads and parses a JSON request body, rejecting anything over `maxBytes`
 * before it is buffered in full. Checks the declared Content-Length first,
 * then counts streamed bytes in case the header is missing or wrong.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = new RequestBodyError(413, `The request body must be smaller than ${Math.round(maxBytes / 1024)} KB.`);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw tooLarge;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new RequestBodyError(415, "Send the request body as application/json.");
  }
  if (!request.body) throw new RequestBodyError(400, "The request body is empty.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw tooLarge;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError(400, "The request body is not valid JSON.");
  }
}

export function jsonError(status: number, error: string, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders } },
  );
}
