import { NextRequest } from "next/server";
export function appUrl() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("JobHunt Tracker must run on localhost.");
  return url;
}
export function assertLocalRequest(request: NextRequest, mutation = false) {
  const host = request.headers.get("host");
  const allowed = new Set([appUrl().host, "localhost:3000", "127.0.0.1:3000"]);
  if (!host || !allowed.has(host)) throw new Error("Untrusted host");
  if (mutation) {
    const origin = request.headers.get("origin");
    if (!origin || !allowed.has(new URL(origin).host))
      throw new Error("Untrusted origin");
  }
}
