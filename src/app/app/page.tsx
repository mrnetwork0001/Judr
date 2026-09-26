import { cookies } from "next/headers";
import Dashboard from "@/components/Dashboard";
import { escrowStatus } from "@/lib/escrow";
import { demoDispute } from "@/lib/fixtures";
import { hasServKey } from "@/lib/serv";
import { readSessionId, SESSION_COOKIE } from "@/lib/session";
import { ESCROW_AMOUNT, getVault, previewVault } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const jar = await cookies();
  const sessionId = readSessionId(
    jar.get(SESSION_COOKIE) ? `${SESSION_COOKIE}=${jar.get(SESSION_COOKIE)!.value}` : null,
  );
  const initialVault = sessionId ? getVault(sessionId) : previewVault();
  // The agent's real address and balances; read on the server, never the keys.
  const escrow = await escrowStatus();

  return (
    <Dashboard
      initialVault={initialVault}
      dispute={demoDispute({ amount: ESCROW_AMOUNT })}
      poisonedDispute={demoDispute({ poisoned: true, amount: ESCROW_AMOUNT })}
      liveCapable={hasServKey()}
      escrow={escrow}
    />
  );
}
