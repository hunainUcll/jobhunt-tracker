import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  db: {
    userSettings: { findUnique: vi.fn() },
    application: { findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  },
  gmail: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: mocks.db }));
vi.mock("../src/lib/google", () => ({
  gmail: mocks.gmail,
  DRAFT_SCOPE: "https://www.googleapis.com/auth/gmail.compose",
}));
import { POST } from "../src/app/api/gmail/draft/route";
function request(body: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/gmail/draft", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
const input = {
  applicationId: "app",
  to: "sarah@acme.example",
  subject: "Follow-up: Data & AI Internship",
  text: "Hi Sarah,\n\nThank you.\nAlex",
};
describe("explicit Gmail draft creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.userSettings.findUnique.mockResolvedValue({
      gmailScopes: "https://www.googleapis.com/auth/gmail.compose",
    });
    mocks.db.application.findUniqueOrThrow.mockResolvedValue({
      status: "Awaiting reply",
      type: "Application",
      dateApplied: new Date("2026-10-01"),
      lastContactDate: null,
      repliedAt: null,
    });
    mocks.gmail.mockResolvedValue({
      id: "draft",
      message: { id: "gmail-message" },
    });
    mocks.db.$transaction.mockImplementation(async (cb) =>
      cb({
        followUp: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        activity: { create: vi.fn() },
      }),
    );
  });
  it("creates only a draft with the user-reviewed text and recipient", async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(mocks.gmail).toHaveBeenCalledTimes(1);
    const [path, options] = mocks.gmail.mock.calls[0];
    expect(path).toBe("drafts");
    expect(options.method).toBe("POST");
    const payload = JSON.parse(options.body);
    const mime = Buffer.from(payload.message.raw, "base64url").toString("utf8");
    expect(mime).toContain("To: sarah@acme.example\r\n");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
    const text = Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString(
      "utf8",
    );
    expect(text).toBe(input.text.replace(/\n/g, "\r\n"));
    expect(await response.json()).toMatchObject({ draftId: "draft" });
  });
  it("cannot create a draft with read-only permission", async () => {
    mocks.db.userSettings.findUnique.mockResolvedValue({
      gmailScopes: "https://www.googleapis.com/auth/gmail.readonly",
    });
    expect((await POST(request(input))).status).toBe(403);
    expect(mocks.gmail).not.toHaveBeenCalled();
  });
  it("rejects header injection", async () => {
    expect(
      (
        await POST(
          request({
            ...input,
            subject: "Follow up\r\nBcc: victim@example.org",
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.gmail).not.toHaveBeenCalled();
  });
  it("does not create a follow-up draft after a reply", async () => {
    mocks.db.application.findUniqueOrThrow.mockResolvedValue({
      status: "Interview",
      type: "Application",
      dateApplied: new Date(),
      lastContactDate: null,
      repliedAt: new Date(),
    });
    expect((await POST(request(input))).status).toBe(409);
    expect(mocks.gmail).not.toHaveBeenCalled();
  });
  it("does not mutate application contact dates while creating a draft", async () => {
    await POST(request(input));
    expect(Object.keys(mocks.db.application)).toEqual(["findUniqueOrThrow"]);
  });
});
