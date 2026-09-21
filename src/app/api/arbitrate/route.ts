/**
 * Arbitration endpoint. Streams the run as server-sent events so the dashboard
 * can render reasoning as it lands, and posts the verdict to the vault when the
 * graph completes.
 */

import { runArbitration } from "@/lib/graph/run";
import { demoDispute } from "@/lib/fixtures";
import { hasServKey } from "@/lib/serv";
import { postVerdict, raiseDispute } from "@/lib/vault";
import type { ArbitrationEvent, DisputeBundle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ArbitrateRequest {
  poisoned?: boolean;
  replay?: boolean;
  bundle?: DisputeBundle;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ArbitrateRequest;
  const bundle = body.bundle ?? demoDispute({ poisoned: body.poisoned });
  const replay = body.replay ?? !hasServKey();

  raiseDispute(
    replay
      ? "Escrow release contested — arbitration requested (recorded run)"
      : "Escrow release contested — arbitration requested",
  );

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

      send({
        type: "step_started",
        step: "mode",
        label: replay ? "Recorded run (no SERV key configured)" : "Live run against SERV",
        at: Date.now(),
      });

      try {
        const result = await runArbitration({ bundle, emit: send, signal: abort.signal, replay });
        postVerdict(result);
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops proxies (notably nginx) from buffering the feed into one lump.
      "X-Accel-Buffering": "no",
    },
  });
}
