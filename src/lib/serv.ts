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

  const res = await fetch(`${args.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            text += delta;
            args.onDelta?.(delta);
          }
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

  return { text, usage };
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
