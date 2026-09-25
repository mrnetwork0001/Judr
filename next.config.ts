import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server under .next/standalone, so the Docker image ships
  // without node_modules. `next start` still works for buildpack hosts.
  output: "standalone",
};

export default nextConfig;
