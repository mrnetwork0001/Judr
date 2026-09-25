import { cookies } from "next/headers";
import Dashboard from "@/components/Dashboard";
import { demoDispute } from "@/lib/fixtures";
import { hasServKey } from "@/lib/serv";
import { readSessionId, SESSION_COOKIE } from "@/lib/session";
import { getVault, previewVault } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  // A returning visitor sees their own vault. A first visit renders a fresh one
  // without storing it; the first API call mints the session cookie.
  const jar = await cookies();
  const sessionId = readSessionId(
    jar.get(SESSION_COOKIE) ? `${SESSION_COOKIE}=${jar.get(SESSION_COOKIE)!.value}` : null,
  );
  const initialVault = sessionId ? getVault(sessionId) : previewVault();

  // The key is read on the server and never crosses to the client — only
  // whether one exists, so the UI can label the run honestly.
  return (
    <Dashboard
      initialVault={initialVault}
      dispute={demoDispute()}
      poisonedDispute={demoDispute({ poisoned: true })}
      liveCapable={hasServKey()}
    />
  );
}
