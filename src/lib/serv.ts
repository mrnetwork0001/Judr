/**
 * SERV client.
 *
 * SERV exposes an OpenAI-compatible surface at /v1/chat/completions, so the
 * transport here is deliberately boring. What is *not* boring is what wraps it:
 * every call is bound to a JSON Schema, the response is re-validated locally,
 * and invalid output is repaired against the validator's error list rather than
 * being silently accepted. That is the difference between "we called a model"
 * and "we ran a typed step".
 */

import { validate, type JsonSchema } from "./graph/schema";

const DEFAULT_BASE_URL = "https://inference-api.openserv.ai/v1";
const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_REPAIRS = 2;
/** Ample for every schema in the graph; stops a runaway completion. */
const MAX_COMPLETION_TOKENS = 8192;
/** Transient statuses get a short retry; a fresh key's rate limit is the usual cause. */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_TRANSPORT_RETRIES = 2;

export interface ServMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Usage {
  prompt: number;
  completion: number;
  total: number;
}

export interface TypedResult<T> {
  value: T;
  model: string;
  usage?: Usage;
  repairs: number;
  /** Raw text of the final (valid) completion, kept for the audit trail. */
  raw: string;
}

export interface TypedOptions {
  schema: JsonSchema;
  schemaName: string;
  messages: ServMessage[];
  /** Called with token deltas so the UI can render reasoning as it lands. */
  onDelta?: (text: string) => void;
  /** Called when a schema violation triggers a repair round. */
  onRepair?: (attempt: number, errors: string[]) => void;
  temperature?: number;
  signal?: AbortSignal;
}

export class ServError extends Error {
  // Written as an explicit field rather than a parameter property, so the file
  // runs under Node's type-stripping in the test suite with no build step.
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ServError";
    this.status = status;
  }
}

/**
 * Published per-million-token rates for the default model, so a decision can
 * carry its own price tag. Another model's usage is priced at these rates and
 * labelled as an estimate.
 */
export const PRICING = { model: DEFAULT_MODEL, inputPerM: 1.0, outputPerM: 6.0 };

export function estimateUsd(promptTokens: number, completionTokens: number): number {
  return Number(((promptTokens * PRICING.inputPerM + completionTokens * PRICING.outputPerM) / 1_000_000).toFixed(4));
}

export function servConfig() {
  return {
    apiKey: process.env.SERV_API_KEY,
    baseUrl: process.env.SERV_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL,
    model: process.env.SERV_MODEL ?? DEFAULT_MODEL,
  };
}

export function hasServKey(): boolean {
  return Boolean(process.env.SERV_API_KEY);
}

/**
 * Runs one typed step: schema-constrained request, local validation, bounded
 * repair. Throws if the step cannot produce schema-valid output — the graph
 * halts rather than passing malformed state downstream.
 */
export async function completeTyped<T>(opts: TypedOptions): Promise<TypedResult<T>> {
  const { apiKey, baseUrl, model } = servConfig();
  if (!apiKey) {
    throw new ServError("SERV_API_KEY is not set. Set it in .env.local, or run in replay mode.");
  }

  const messages = [...opts.messages];
  let repairs = 0;

  for (let attempt = 0; ; attempt++) {
    const { text, usage } = await streamCompletion({
      apiKey,
      baseUrl,
      model,
      messages,
      schema: opts.schema,
      schemaName: opts.schemaName,
      temperature: opts.temperature,
      onDelta: opts.onDelta,
      signal: opts.signal,
    });

    const parsed = parseJson(text);

    if (parsed.ok) {
      const errors = validate(parsed.value, opts.schema);
      if (errors.length === 0) {
        return { value: parsed.value as T, model, usage, repairs, raw: text };
      }
      if (attempt >= MAX_REPAIRS) throw schemaFailure(opts.schemaName, attempt, errors);
      repairs++;
      opts.onRepair?.(repairs, errors);
      pushRepair(messages, text, errors);
      continue;
    }

    const errors = [`$: response was not valid JSON (${parsed.error})`];

    if (attempt >= MAX_REPAIRS) throw schemaFailure(opts.schemaName, attempt, errors);

    repairs++;
    opts.onRepair?.(repairs, errors);
    pushRepair(messages, text, errors);
  }
}

function schemaFailure(schemaName: string, attempt: number, errors: string[]): ServError {
  return new ServError(
    `step "${schemaName}" failed schema validation after ${attempt + 1} attempts:\n` +
      errors.join("\n"),
  );
}

/** Feeds the validator's own error list back as the repair instruction. */
function pushRepair(messages: ServMessage[], text: string, errors: string[]): void {
  messages.push({ role: "assistant", content: text });
  messages.push({
    role: "user",
    content:
      "Your previous response did not satisfy the required schema. " +
      "Fix exactly these problems and return the corrected JSON object only:\n" +
      errors.map((e) => `- ${e}`).join("\n"),
  });
}

interface StreamArgs {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ServMessage[];
  schema: JsonSchema;
  schemaName: string;
  temperature?: number;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

async function streamCompletion(args: StreamArgs): Promise<{ text: string; usage?: Usage }> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  };
  if (args.temperature !== undefined) body.temperature = args.temperature;

  const res = await postWithRetry(args, JSON.stringify(body));

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new ServError(
        `SERV rejected the API key (${res.status}). Check SERV_API_KEY in .env.local.`,
        res.status,
      );
    }
    throw new ServError(
      `SERV request failed (${res.status} ${res.statusText}) ${detail.slice(0, 400)}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: Usage | undefined;
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. The spec allows CRLF as well
    // as LF, and a proxy that normalises line endings would otherwise leave
    // the reader waiting forever for a "\n\n" that never arrives.
    let match: RegExpExecArray | null;
    while ((match = FRAME_BOUNDARY.exec(buffer)) !== null) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);

      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const choice = chunk?.choices?.[0];
          const delta = choice?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            text += delta;
            args.onDelta?.(delta);
          }
          if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
          if (chunk?.usage) {
            usage = {
              prompt: chunk.usage.prompt_tokens ?? 0,
              completion: chunk.usage.completion_tokens ?? 0,
              total: chunk.usage.total_tokens ?? 0,
            };
          }
        } catch {
          // A malformed frame is not fatal; the accumulated text is validated
          // against the schema at the end regardless.
        }
      }
    }
  }

  // A truncated completion is not schema-invalid JSON to be repaired; it is a
  // different failure, and the repair prompt would only make it worse.
  if (finishReason === "length") {
    throw new ServError(
      `SERV completion for "${args.schemaName}" was cut off at ${MAX_COMPLETION_TOKENS} tokens.`,
    );
  }
  if (finishReason === "content_filter") {
    throw new ServError(`SERV refused the "${args.schemaName}" step (content filter).`);
  }

  return { text, usage };
}

const FRAME_BOUNDARY = /\r?\n\r?\n/;

/**
 * One request, retried briefly on transient statuses. Honours Retry-After when
 * the server sends one; otherwise backs off 1s then 2s.
 */
async function postWithRetry(args: StreamArgs, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${args.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body,
      signal: args.signal,
    });

    if (!RETRY_STATUSES.has(res.status) || attempt >= MAX_TRANSPORT_RETRIES) return res;

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
    await res.body?.cancel().catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, waitMs);
      args.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new ServError("aborted"));
        },
        { once: true },
      );
    });
  }
}

type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * Models occasionally wrap JSON in prose or a code fence even under structured
 * output. Recover the outermost object rather than failing the step for it.
 */
function parseJson(text: string): ParseResult {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      continue;
    }
  }
  return { ok: false, error: trimmed.slice(0, 120) || "empty response" };
}
