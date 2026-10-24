import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  experimental: { agentUpgrade: "security" },
};
export default config;
