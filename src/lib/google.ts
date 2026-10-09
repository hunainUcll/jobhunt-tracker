import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./security";
export const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const DRAFT_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
};
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error("Set TOKEN_ENCRYPTION_KEY to 64 hex characters in .env.");
  return Buffer.from(value, "hex");
}
export function encrypt(tokens: Tokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}
export function decrypt(value: string): Tokens {
  const [iv, tag, data] = value.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(data, "hex")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export function oauthConfig() {
  key();
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    throw new Error("Configure Google OAuth credentials in .env first.");
  return {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: new URL("/api/google/callback", appUrl()).toString(),
  };
}
export async function tokenExchange(values: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ ...oauthConfig(), ...values }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Google authorization failed. Reconnect Gmail.");
  return (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}
export async function saveTokens(
  data: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  },
  email: string,
  fallbackScope: string,
) {
  const settings = await db.userSettings.findUnique({ where: { id: "local" } });
  if (settings?.gmailEmail && settings.gmailEmail !== email)
    throw new Error(
      "Disconnect the existing Gmail account before connecting a different account.",
    );
  const old = settings?.encryptedTokens
    ? decrypt(settings.encryptedTokens)
    : null;
  const tokens: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || old?.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope || fallbackScope,
  };
  if (!tokens.scope.includes(READ_SCOPE))
    throw new Error(
      "Read-only Gmail permission is required. Please reconnect and approve it.",
    );
  await db.userSettings.upsert({
    where: { id: "local" },
    create: {
      id: "local",
      gmailEmail: email,
      encryptedTokens: encrypt(tokens),
      gmailScopes: tokens.scope,
    },
    update: {
      gmailEmail: email,
      encryptedTokens: encrypt(tokens),
      gmailScopes: tokens.scope,
    },
  });
}
export async function accessToken() {
  const settings = await db.userSettings.findUnique({ where: { id: "local" } });
  if (!settings?.encryptedTokens)
    throw new Error("Connect Gmail in Settings first.");
  let tokens = decrypt(settings.encryptedTokens);
  if (tokens.expires_at < Date.now() + 60000) {
    if (!tokens.refresh_token)
      throw new Error("Reconnect Gmail to refresh access.");
    const data = await tokenExchange({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    tokens = {
      ...tokens,
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    await db.userSettings.update({
      where: { id: "local" },
      data: { encryptedTokens: encrypt(tokens) },
    });
  }
  return tokens.access_token;
}
export async function gmail<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Gmail authorization expired. Reconnect in Settings."
        : r.status === 429
          ? "Gmail rate limit reached. Try syncing later."
          : `Gmail request failed (${r.status}).`,
    );
  return r.json();
}
