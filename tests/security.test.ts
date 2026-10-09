import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { assertLocalRequest } from "../src/lib/security";
describe("localhost request protection", () => {
  it("allows a same-origin local mutation", () =>
    expect(() =>
      assertLocalRequest(
        new NextRequest("http://localhost:3000/api/gmail/sync", {
          method: "POST",
          headers: { host: "localhost:3000", origin: "http://localhost:3000" },
        }),
        true,
      ),
    ).not.toThrow());
  it("rejects cross-origin writes", () =>
    expect(() =>
      assertLocalRequest(
        new NextRequest("http://localhost:3000/api/gmail/sync", {
          method: "POST",
          headers: { host: "localhost:3000", origin: "https://evil.example" },
        }),
        true,
      ),
    ).toThrow("Untrusted origin"));
  it("rejects host rebinding", () =>
    expect(() =>
      assertLocalRequest(
        new NextRequest("http://evil.example/api/csv", {
          headers: { host: "evil.example" },
        }),
      ),
    ).toThrow("Untrusted host"));
  it("rejects writes without an origin", () =>
    expect(() =>
      assertLocalRequest(
        new NextRequest("http://localhost:3000/api/csv", {
          method: "POST",
          headers: { host: "localhost:3000" },
        }),
        true,
      ),
    ).toThrow("Untrusted origin"));
});
