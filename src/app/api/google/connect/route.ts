import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { oauthConfig, READ_SCOPE, DRAFT_SCOPE } from "@/lib/google";
import { db } from "@/lib/db";
export async function GET(request: NextRequest) {
  try {
    const config = oauthConfig();
    const drafts = request.nextUrl.searchParams.get("drafts") === "1";
    if (
      drafts &&
      !(await db.userSettings.findUnique({
        where: { id: "local", gmailEmail: { not: null } },
      }))
    )
      throw new Error("Connect Gmail with read-only access first.");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const scope = [READ_SCOPE, ...(drafts ? [DRAFT_SCOPE] : [])].join(" ");
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      include_granted_scopes: "true",
    });
    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    );
    response.cookies.set(
      "jobhunt-oauth",
      JSON.stringify({ state, verifier, scope }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/api/google",
        maxAge: 600,
      },
    );
    return response;
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/settings?error=${encodeURIComponent(e instanceof Error ? e.message : "OAuth setup failed")}`,
        request.url,
      ),
    );
  }
}
