/**
 * The SERV client against a local mock of the chat-completions endpoint.
 * No network, no key: the point is the parts that break on first live contact
 * - frame splitting, the repair loop, retries and the error messages.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { VERDICT_SCHEMA } from "../graph/schema";

// Route every request to whatever the current test installed.
let handler: (req: IncomingMessage, body: string, res: ServerResponse) => void = () => {};
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => handler(req, body, res));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
after(() => server.close());

// The client reads its config from env at call time.
process.env.SERV_API_KEY = "test-key";
process.env.SERV_BASE_URL = `http://127.0.0.1:${port}/v1`;
const { completeTyped, ServError } = await import("../serv");

const VALID = { winner: "plaintiff", award_basis: "b", decisive_clauses: ["c1"], rationale: "r" };
const INVALID = { winner: "the vibes", award_basis: "b", decisive_clauses: ["c1"], rationale: "r" };

/** Streams `payload` as SSE, one chunk per character group, with the given line ending. */
function sse(res: ServerResponse, payload: object, eol: "\n" | "\r\n", finish = "stop") {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const text = JSON.stringify(payload);
  const parts = text.match(/.{1,7}/g) ?? [];
  for (const part of parts) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}${eol}${eol}`);
  }
  res.write(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}${eol}${eol}`,
  );
  res.write(`data: [DONE]${eol}${eol}`);
  res.end();
}

const call = () =>
  completeTyped<typeof VALID>({
    schema: VERDICT_SCHEMA,
    schemaName: "verdict",
    messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }],
  });

test("parses LF-delimited SSE and reports usage", async () => {
  handler = (_req, _body, res) => sse(res, VALID, "\n");
  const result = await call();
  assert.deepEqual(result.value, VALID);
  assert.equal(result.usage?.total, 30);
  assert.equal(result.repairs, 0);
});

test("parses CRLF-delimited SSE identically", async () => {
  // A proxy normalising line endings used to leave the reader waiting forever.
  handler = (_req, _body, res) => sse(res, VALID, "\r\n");
  const result = await call();
  assert.deepEqual(result.value, VALID);
});

test("sends the schema as strict json_schema and caps completion tokens", async () => {
  let seen: Record<string, unknown> = {};
  handler = (_req, body, res) => {
    seen = JSON.parse(body);
    sse(res, VALID, "\n");
  };
  await call();
  const rf = seen.response_format as { type: string; json_schema: { strict: boolean; name: string } };
  assert.equal(rf.type, "json_schema");
  assert.equal(rf.json_schema.strict, true);
  assert.equal(rf.json_schema.name, "verdict");
  assert.equal(typeof seen.max_completion_tokens, "number");
  assert.equal(seen.stream, true);
});

test("repairs schema-invalid output by feeding back the validator's errors", async () => {
  let calls = 0;
  let repairPrompt = "";
  handler = (_req, body, res) => {
    calls++;
    const msgs = JSON.parse(body).messages as { role: string; content: string }[];
    if (calls === 1) return sse(res, INVALID, "\n");
    repairPrompt = msgs[msgs.length - 1].content;
    sse(res, VALID, "\n");
  };
  const result = await call();
  assert.equal(calls, 2);
  assert.equal(result.repairs, 1);
  assert.match(repairPrompt, /winner: expected one of plaintiff \| defendant/);
});

test("gives up after the repair budget with a message naming the step", async () => {
  handler = (_req, _body, res) => sse(res, INVALID, "\n");
  await assert.rejects(call(), (e: Error) => e instanceof ServError && /"verdict" failed schema validation after 3 attempts/.test(e.message));
});

test("retries a 429 and then succeeds", async () => {
  let calls = 0;
  handler = (_req, _body, res) => {
    calls++;
    if (calls === 1) {
      res.writeHead(429, { "Retry-After": "0" });
      return res.end("slow down");
    }
    sse(res, VALID, "\n");
  };
  const result = await call();
  assert.equal(calls, 2);
  assert.deepEqual(result.value, VALID);
});

test("a rejected key is reported as a key problem, not a schema problem", async () => {
  handler = (_req, _body, res) => {
    res.writeHead(401);
    res.end("nope");
  };
  await assert.rejects(call(), (e: Error) => e instanceof ServError && /rejected the API key/.test(e.message) && e.status === 401);
});

test("a truncated completion is its own failure, not a repair candidate", async () => {
  let calls = 0;
  handler = (_req, _body, res) => {
    calls++;
    sse(res, VALID, "\n", "length");
  };
  await assert.rejects(call(), (e: Error) => /cut off/.test(e.message));
  assert.equal(calls, 1, "must not enter the repair loop");
});
