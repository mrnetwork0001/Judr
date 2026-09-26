import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server under .next/standalone, so the Docker image ships
  // without node_modules. `next start` still works for buildpack hosts.
  output: "standalone",
  // Node-only SDKs with native fallbacks; load them as-is at runtime rather
  // than bundling them, which broke the build's page-data step on Linux.
  serverExternalPackages: ["@coinbase/agentkit", "@coinbase/cdp-sdk", "@ixswap1/vault-agent-sdk"],
};

export default nextConfig;
