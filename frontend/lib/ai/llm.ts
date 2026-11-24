/**
 * Minimal server-side client for structured JSON output from a vision-capable
 * LLM. Uses native fetch, no SDK.
 *
 * Provider precedence follows the repo convention (the FastAPI backend uses
 * Groq): GROQ_API_KEY, then OPENAI_API_KEY, then GEMINI_API_KEY (or its alias
 * GOOGLE_GENERATIVE_AI_API_KEY). Keys are read from server environment
 * variables only and must never use a NEXT_PUBLIC_ prefix. With no key
 * configured, callers use their deterministic fallback.
 *
 * Groq and OpenAI use Chat Completions with `json_schema` output. Gemini uses
 * its native generateContent API with `responseJsonSchema`, which keeps keys in
 * schema order and lets us cap thinking so it cannot eat the output budget.
 */

export type LlmProviderName = "groq" | "openai" | "gemini";

export interface LlmProvider {
  name: LlmProviderName;
  model: string;
  endpoint: string;
  apiKey: string;
}

export type LlmErrorKind =
  | "network"
  | "timeout"
  | "http"
  | "refused"
  | "empty"
  | "truncated"
  | "invalid-json"
  | "unsupported";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly status: number | null = null,
    /** Provider's own error text, with anything key-like redacted. Server logs only. */
    readonly detail = "",
  ) {
    super(message);
    this.name = "LlmError";
  }

  /** The provider answered, but its content could not be used. */
  get isUnusableResponse(): boolean {
    return this.kind === "empty" || this.kind === "truncated" || this.kind === "invalid-json";
  }
}

/** One log-safe line describing a failed call. Never includes the API key. */
export function describeLlmError(error: unknown): string {
  if (!(error instanceof LlmError)) return error instanceof Error ? error.message : String(error);
  const status = error.status ? ` HTTP ${error.status}` : "";
  const detail = error.detail ? ` (${error.detail})` : "";
  return `${error.kind}${status}: ${error.message}${detail}`;
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
      // gpt-4o-mini and gpt-4.1-mini shut down on 2027-01-14; gpt-6-luna is
      // OpenAI's named replacement and accepts image input.
      model: env("OPENAI_VISION_MODEL") || "gpt-6-luna",
      endpoint: `${base}/chat/completions`,
      apiKey: openAiKey,
    };
  }

  const geminiKey = env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY");
  if (geminiKey) {
    // gemini-2.5-flash shuts down on 2026-12-01.
    const model = (env("GEMINI_MODEL") || "gemini-3.8-flash").replace(/^models\//, "");
    return {
      name: "gemini",
      model,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      apiKey: geminiKey,
    };
  }

  return null;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface StructuredCompletionRequest {
  system: string;
  user: string | ChatContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  /** Budget for the visible answer. Reasoning tokens get their own allowance. */
  maxTokens?: number;
  /** Applied only where the model honors it; reasoning models reject or ignore it. */
  temperature?: number;
}

const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TEMPERATURE = 0.2;
// Reasoning and thinking tokens share the output limit. Without this headroom
// the model can spend the whole budget thinking and return empty JSON.
const REASONING_TOKEN_ALLOWANCE = 4096;
const MAX_DETAIL_LENGTH = 240;

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const KEY_LIKE_PATTERN = /\b(?:sk-[\w*-]{6,}|gsk_[\w*]{6,}|AIza[\w-]{10,}|hf_[\w]{6,})/g;

function redact(text: string, apiKey: string): string {
  const withoutKey = apiKey ? text.split(apiKey).join("[redacted]") : text;
  return withoutKey.replace(KEY_LIKE_PATTERN, "[redacted]").replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

async function readErrorDetail(response: Response, apiKey: string): Promise<string> {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string };
    const candidate = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (typeof candidate === "string") message = candidate;
  } catch {
    // Not JSON; keep the raw text.
  }
  return redact(message, apiKey);
}

async function postJson(
  provider: LlmProvider,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(provider.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw timedOut
      ? new LlmError("The AI provider timed out.", "timeout")
      : new LlmError("The AI provider could not be reached.", "network");
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response, provider.apiKey);
    throw new LlmError(`The AI provider returned HTTP ${response.status}.`, "http", response.status, detail);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (payload === null) throw new LlmError("The AI provider returned a non-JSON body.", "invalid-json");
  return payload;
}

function stripCodeFence(content: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
  return fenced ? fenced[1] : content;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(stripCodeFence(content));
  } catch {
    throw new LlmError("The AI provider returned invalid JSON.", "invalid-json", null, content.slice(0, 120));
  }
}

function schemaInstruction(system: string, schema: Record<string, unknown>): string {
  return `${system}\n\nRespond with a single JSON object that matches this JSON Schema exactly, with keys in this order:\n${JSON.stringify(schema)}`;
}

/* -------------------------------------------------------------------------- */
/* Groq and OpenAI: Chat Completions                                          */
/* -------------------------------------------------------------------------- */

/** OpenAI reasoning models (o-series, GPT-5 and later) reject `temperature`. */
function isOpenAiReasoningModel(model: string): boolean {
  return /^(o\d|gpt-([5-9]|\d{2}))/i.test(model) && !/-chat\b/i.test(model);
}

function chatSamplingParams(provider: LlmProvider, request: StructuredCompletionRequest): Record<string, unknown> {
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
  if (provider.name === "openai" && isOpenAiReasoningModel(provider.model)) {
    // The structured schema keeps answers deterministic; low effort keeps latency down.
    return { reasoning_effort: "low", max_completion_tokens: maxTokens + REASONING_TOKEN_ALLOWANCE };
  }
  if (provider.name === "openai") return { temperature, max_completion_tokens: maxTokens };
  return { temperature, max_tokens: maxTokens };
}

function chatUserContent(provider: LlmProvider, user: StructuredCompletionRequest["user"]): unknown {
  if (typeof user === "string") return user;
  // `detail` is an OpenAI extension; other compatible APIs get the plain shape.
  return user.map((part) => (
    part.type === "image_url" && provider.name !== "openai"
      ? { type: "image_url", image_url: { url: part.image_url.url } }
      : part
  ));
}

async function postChatCompletion(
  provider: LlmProvider,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const payload = await postJson(provider, { Authorization: `Bearer ${provider.apiKey}` }, { model: provider.model, ...body }, signal);
  const choice = (payload as {
    choices?: { finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }[];
  }).choices?.[0];
  const message = choice?.message;
  if (typeof message?.refusal === "string" && message.refusal) {
    throw new LlmError("The AI provider declined the request.", "refused", null, redact(message.refusal, provider.apiKey));
  }
  if (choice?.finish_reason === "length") {
    throw new LlmError("The AI response hit the token limit before finishing.", "truncated");
  }
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw new LlmError("The AI provider returned an empty response.", "empty");
  }
  return parseJsonContent(message.content);
}

async function requestChatCompletion(
  provider: LlmProvider,
  request: StructuredCompletionRequest,
  signal: AbortSignal,
): Promise<unknown> {
  const user = { role: "user", content: chatUserContent(provider, request.user) };
  const sampling = chatSamplingParams(provider, request);

  try {
    return await postChatCompletion(provider, {
      ...sampling,
      messages: [{ role: "system", content: request.system }, user],
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      },
    }, signal);
  } catch (error) {
    // Some compatibility layers reject strict json_schema with HTTP 400.
    if (!(error instanceof LlmError) || error.status !== 400 || signal.aborted) throw error;
    console.warn(`[llm] ${provider.name}/${provider.model} rejected json_schema; retrying in json_object mode. ${describeLlmError(error)}`);
  }

  return postChatCompletion(provider, {
    ...sampling,
    messages: [{ role: "system", content: schemaInstruction(request.system, request.schema) }, user],
    response_format: { type: "json_object" },
  }, signal);
}

/* -------------------------------------------------------------------------- */
/* Gemini: native generateContent                                             */
/* -------------------------------------------------------------------------- */

const DATA_URL_PATTERN = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

function geminiParts(user: StructuredCompletionRequest["user"]): Record<string, unknown>[] {
  if (typeof user === "string") return [{ text: user }];
  return user.map((part) => {
    if (part.type === "text") return { text: part.text };
    const match = DATA_URL_PATTERN.exec(part.image_url.url);
    if (!match) throw new LlmError("Gemini needs images as base64 data URLs.", "unsupported");
    return { inlineData: { mimeType: match[1], data: match[2] } };
  });
}

/**
 * Gemini 3 and 4 take `thinkingLevel` (and cannot fully turn thinking off);
 * Gemini 2.5 Flash takes `thinkingBudget`, where 0 disables it. Sending the
 * wrong one is a 400, so unknown models get no thinking config at all.
 */
function geminiThinkingConfig(model: string): Record<string, unknown> | null {
  if (/^gemini-2\.5-flash/i.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[34]/i.test(model)) return { thinkingLevel: "low" };
  return null;
}

function geminiGenerationConfig(
  model: string,
  request: StructuredCompletionRequest,
  strict: boolean,
): Record<string, unknown> {
  const thinking = strict ? geminiThinkingConfig(model) : null;
  const thinkingOff = thinking?.thinkingBudget === 0;
  return {
    responseMimeType: "application/json",
    ...(strict ? { responseJsonSchema: request.schema } : {}),
    maxOutputTokens: (request.maxTokens ?? DEFAULT_MAX_TOKENS) + (thinkingOff ? 0 : REASONING_TOKEN_ALLOWANCE),
    // Gemini 3.6 Flash and newer silently ignore temperature, and Google advised
    // against lowering it on the earlier Gemini 3 thinking models.
    ...(/^gemini-(1|2)\./i.test(model) ? { temperature: request.temperature ?? DEFAULT_TEMPERATURE } : {}),
    ...(thinking ? { thinkingConfig: thinking } : {}),
  };
}

const GEMINI_REFUSAL_REASONS = new Set([
  "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT",
]);

async function postGeminiContent(
  provider: LlmProvider,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const payload = await postJson(provider, { "x-goog-api-key": provider.apiKey }, body, signal) as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: { finishReason?: unknown; content?: { parts?: { text?: unknown; thought?: unknown }[] } }[];
  };

  const blockReason = payload.promptFeedback?.blockReason;
  if (typeof blockReason === "string" && blockReason) {
    throw new LlmError("The AI provider blocked the request.", "refused", null, blockReason);
  }
  const candidate = payload.candidates?.[0];
  const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : "";
  if (GEMINI_REFUSAL_REASONS.has(finishReason)) {
    throw new LlmError("The AI provider declined the request.", "refused", null, finishReason);
  }
  if (finishReason === "MAX_TOKENS") {
    throw new LlmError("The AI response hit the token limit before finishing.", "truncated");
  }

  const text = (candidate?.content?.parts ?? [])
    .filter((part) => typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text as string)
    .join("");
  if (!text.trim()) throw new LlmError("The AI provider returned an empty response.", "empty", null, finishReason);
  return parseJsonContent(text);
}

async function requestGeminiContent(
  provider: LlmProvider,
  request: StructuredCompletionRequest,
  signal: AbortSignal,
): Promise<unknown> {
  const contents = [{ role: "user", parts: geminiParts(request.user) }];

  try {
    return await postGeminiContent(provider, {
      systemInstruction: { parts: [{ text: request.system }] },
      contents,
      generationConfig: geminiGenerationConfig(provider.model, request, true),
    }, signal);
  } catch (error) {
    // An older or unknown model may reject the schema or thinking config.
    if (!(error instanceof LlmError) || error.status !== 400 || signal.aborted) throw error;
    console.warn(`[llm] gemini/${provider.model} rejected the strict config; retrying with a prompt-only schema. ${describeLlmError(error)}`);
  }

  return postGeminiContent(provider, {
    systemInstruction: { parts: [{ text: schemaInstruction(request.system, request.schema) }] },
    contents,
    generationConfig: geminiGenerationConfig(provider.model, request, false),
  }, signal);
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Requests a JSON object matching `schema` using the provider's native
 * structured-output mode. If the provider rejects that mode with HTTP 400, it
 * retries once with the schema in the prompt instead. The caller must still
 * validate the result.
 */
export async function requestStructuredCompletion(
  provider: LlmProvider,
  request: StructuredCompletionRequest,
): Promise<unknown> {
  const signal = AbortSignal.timeout(request.timeoutMs);
  return provider.name === "gemini"
    ? requestGeminiContent(provider, request, signal)
    : requestChatCompletion(provider, request, signal);
}
