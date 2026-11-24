/**
 * Minimal server-side client for OpenAI-compatible chat completions with
 * structured JSON output. Uses native fetch, no SDK.
 *
 * Provider precedence follows the repo convention (the FastAPI backend uses
 * Groq): GROQ_API_KEY, then OPENAI_API_KEY, then GEMINI_API_KEY. Keys are read
 * from server environment variables only and must never use a NEXT_PUBLIC_
 * prefix. With no key configured, callers use their deterministic fallback.
 */

export type LlmProviderName = "groq" | "openai" | "gemini";

export interface LlmProvider {
  name: LlmProviderName;
  model: string;
  endpoint: string;
  apiKey: string;
}

export class LlmError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "LlmError";
  }
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveLlmProvider(): LlmProvider | null {
  const groqKey = env("GROQ_API_KEY");
  if (groqKey) {
    // Matches the backend: GROQ_BASE_URL is the API host, like the Groq SDK's base_url.
    const base = trimSlash(env("GROQ_BASE_URL") || "https://api.groq.com");
    return {
      name: "groq",
      // Groq currently marks this public vision model as Preview; keep it configurable.
      model: env("GROQ_VISION_MODEL") || "qwen/qwen3.8-27b",
      endpoint: `${base}/openai/v1/chat/completions`,
      apiKey: groqKey,
    };
  }

  const openAiKey = env("OPENAI_API_KEY");
  if (openAiKey) {
    const base = trimSlash(env("OPENAI_BASE_URL") || "https://api.openai.com/v1");
    return {
      name: "openai",
      model: env("OPENAI_VISION_MODEL") || "gpt-4o-mini",
      endpoint: `${base}/chat/completions`,
      apiKey: openAiKey,
    };
  }

  const geminiKey = env("GEMINI_API_KEY");
  if (geminiKey) {
    return {
      name: "gemini",
      model: env("GEMINI_MODEL") || "gemini-2.5-flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: geminiKey,
    };
  }

  return null;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface StructuredCompletionRequest {
  system: string;
  user: string | ChatContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  maxTokens?: number;
}

function stripCodeFence(content: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
  return fenced ? fenced[1] : content;
}

async function postCompletion(
  provider: LlmProvider,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: provider.model, ...body }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new LlmError(timedOut ? "The AI provider timed out." : "The AI provider could not be reached.");
  }

  if (!response.ok) {
    throw new LlmError(`The AI provider returned HTTP ${response.status}.`, response.status);
  }

  const payload: unknown = await response.json().catch(() => null);
  const message = (payload as { choices?: { message?: { content?: unknown; refusal?: unknown } }[] } | null)
    ?.choices?.[0]?.message;
  if (typeof message?.refusal === "string" && message.refusal) {
    throw new LlmError("The AI provider declined the request.");
  }
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw new LlmError("The AI provider returned an empty response.");
  }

  try {
    return JSON.parse(stripCodeFence(message.content));
  } catch {
    throw new LlmError("The AI provider returned invalid JSON.");
  }
}

/**
 * Requests a JSON object matching `schema`. Strict `json_schema` output is
 * tried first. Providers that reject it with HTTP 400 (some compatibility
 * layers) get one retry in `json_object` mode, with the schema in the prompt.
 * The caller must still validate the result.
 */
export async function requestStructuredCompletion(
  provider: LlmProvider,
  request: StructuredCompletionRequest,
): Promise<unknown> {
  const signal = AbortSignal.timeout(request.timeoutMs);
  const messages = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];
  const common = { temperature: 0.2, max_tokens: request.maxTokens ?? 1200, messages };

  try {
    return await postCompletion(provider, {
      ...common,
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      },
    }, signal);
  } catch (error) {
    if (!(error instanceof LlmError) || error.status !== 400 || signal.aborted) throw error;
  }

  return postCompletion(provider, {
    ...common,
    messages: [
      {
        role: "system",
        content: `${request.system}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(request.schema)}`,
      },
      messages[1],
    ],
    response_format: { type: "json_object" },
  }, signal);
}
