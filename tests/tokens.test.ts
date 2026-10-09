import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("../src/lib/db", () => ({ db: {} }));
import { encrypt, decrypt } from "../src/lib/google";
afterEach(() => vi.unstubAllEnvs());
describe("OAuth tokens at rest", () => {
  const tokens = {
    access_token: "secret-access",
    refresh_token: "secret-refresh",
    expires_at: 123456,
    scope: "gmail.readonly",
  };
  it("encrypts tokens with randomized authenticated ciphertext", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const first = encrypt(tokens);
    expect(first).not.toContain("secret-access");
    expect(first).not.toBe(encrypt(tokens));
    expect(decrypt(first)).toEqual(tokens);
  });
  it("rejects a tampered token", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const value = encrypt(tokens).split(":");
    value[2] = (value[2][0] === "0" ? "1" : "0") + value[2].slice(1);
    expect(() => decrypt(value.join(":"))).toThrow();
  });
  it("requires a valid 256-bit key", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "short");
    expect(() => encrypt(tokens)).toThrow("TOKEN_ENCRYPTION_KEY");
  });
});
