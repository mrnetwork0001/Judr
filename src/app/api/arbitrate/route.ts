/**
 * Arbitration endpoint. Streams the run as server-sent events so the dashboard
 * can render reasoning as it lands, and posts the verdict to the caller's vault
 * when the graph completes.
 *
 * The request chooses only whether the tampered document is included. It does
 * not choose the evidence bundle and it does not choose live-versus-recorded:
 * both would let an anonymous caller spend the owner's SERV key on arbitrary
 * input, and the second would let a recorded run be labelled live.
 */

import { runArbitration } from "@/lib/graph/run";
import { allowCustomRun, allowRun, toBundle, type CustomDisputeInput } from "@/lib/custom";
import { demoDispute } from "@/lib/fixtures";
import { hasServKey } from "@/lib/serv";
import { sessionFor, withSession } from "@/lib/session";
import { getVault, postVerdict, raiseDispute, VaultError } from "@/lib/vault";
import type { ArbitrationEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ArbitrateRequest {
  poisoned?: boolean;
  /** A visitor's own dispute. Bounded in custom.ts; needs a live key. */
  custom?: CustomDisputeInput;
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const body = (await request.json().catch(() => ({}))) as ArbitrateRequest;
  if (!hasServKey()) {
    return withSession(
      Response.json({ error: "SERV_API_KEY is not set. Judr decides cases live on SERV and has no recorded fallback." }, { status: 503 }),
      session,
    );
  }

  const gate = allowRun(session.id);
  if (!gate.allowed) return withSession(Response.json({ error: gate.reason }, { status: 429 }), session);

  let bundle;
  if (body.custom) {
    const gate = allowCustomRun(session.id);
    if (!gate.allowed) {
      return withSession(
        Response.json({ error: `Custom runs are limited to a few per hour. Try again in about ${gate.retryInMinutes} minutes.` }, { status: 429 }),
        session,
      );
    }
    let parsed;
    try {
      parsed = toBundle(body.custom, getVault(session.id).id);
    } catch (error) {
      return withSession(Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }), session);
    }
    if (!parsed.ok) return withSession(Response.json({ error: parsed.error }, { status: 400 }), session);
    bundle = parsed.bundle;
  } else {
    bundle = demoDispute({ poisoned: body.poisoned === true });
  }

  try {
    raiseDispute(session.id, "Escrow release contested - arbitration requested");
  } catch (error) {
    const status = error instanceof VaultError ? 409 : 500;
    return withSession(
      Response.json({ error: error instanceof Error ? error.message : String(error) }, { status }),
      session,
    );
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ArbitrationEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "step_started", step: "mode", label: "Live run against SERV", at: Date.now() });

      try {
        const result = await runArbitration({ bundle, emit: send, signal: abort.signal });
        postVerdict(session.id, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!abort.signal.aborted) {
          send({ type: "run_failed", step: "run", error: message });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by client disconnect.
        }
      }
    },
  });

  return withSession(
    new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Stops proxies (notably nginx) from buffering the feed into one lump.
        "X-Accel-Buffering": "no",
      },
    }),
    session,
  );
}
