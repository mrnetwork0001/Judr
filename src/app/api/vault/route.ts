/**
 * Vault state and lifecycle actions.
 *
 * Release is a separate, explicit call that the mock contract refuses to honour
 * before the appeal window closes — the check lives with the funds, not with
 * the caller.
 */

import { appeal, getVault, release, resetVault } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getVault());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "reset" | "appeal" | "release";
    reason?: string;
  };

  try {
    switch (body.action) {
      case "reset":
        return Response.json(resetVault());
      case "appeal":
        return Response.json(appeal(body.reason ?? "Appeal lodged by the losing party"));
      case "release":
        return Response.json(release());
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
