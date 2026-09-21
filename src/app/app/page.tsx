import Dashboard from "@/components/Dashboard";
import { demoDispute } from "@/lib/fixtures";
import { hasServKey } from "@/lib/serv";
import { getVault } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default function AppPage() {
  // The key is read on the server and never crosses to the client — only
  // whether one exists, so the UI can label the run honestly.
  return (
    <Dashboard
      initialVault={getVault()}
      dispute={demoDispute()}
      poisonedDispute={demoDispute({ poisoned: true })}
      liveCapable={hasServKey()}
    />
  );
}
