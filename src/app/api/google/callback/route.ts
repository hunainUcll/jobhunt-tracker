import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { saveTokens, tokenExchange } from "@/lib/google";
export async function GET(request: NextRequest) {
  let location = "/settings?connected=1";
  try {
    const cookie = request.cookies.get("jobhunt-oauth")?.value;
    if (!cookie)
      throw new Error("Authorization session expired. Please reconnect.");
    const saved = JSON.parse(cookie) as {
      state: string;
      verifier: string;
      scope: string;
    };
    const state = request.nextUrl.searchParams.get("state") || "";
    if (
      state.length !== saved.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))
    )
      throw new Error("Authorization state did not match.");
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Gmail authorization was cancelled.");
    const data = await tokenExchange({
      grant_type: "authorization_code",
      code,
      code_verifier: saved.verifier,
    });
    const r = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      },
    );
    if (!r.ok) throw new Error("Could not verify the Gmail account.");
    const profile = (await r.json()) as { emailAddress: string };
    await saveTokens(data, profile.emailAddress, saved.scope);
  } catch (e) {
    location = `/settings?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not connect Gmail")}`;
  }
  const response = NextResponse.redirect(new URL(location, request.url));
  response.cookies.delete({ name: "jobhunt-oauth", path: "/api/google" });
  return response;
}
