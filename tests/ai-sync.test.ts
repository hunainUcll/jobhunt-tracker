import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: {
    userSettings: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    application: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    company: { findUniqueOrThrow: vi.fn() },
    emailMessage: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailThread: { findUnique: vi.fn(), upsert: vi.fn() },
    followUp: { updateMany: vi.fn() },
    activity: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  gmail: vi.fn(),
  classify: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: mocks.db }));
vi.mock("../src/lib/google", () => ({ gmail: mocks.gmail }));
vi.mock("../src/lib/local-ai", () => ({ classifyForSync: mocks.classify }));
import { syncGmail } from "../src/lib/mail-sync";
const result = {
  isJobRelated: true,
  company: "Acme",
  role: "Data Internship",
  status: "INTERVIEW",
  confidence: 0.95,
  reason: "Interview invitation",
};
describe("AI suggestions during Gmail sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.userSettings.findUnique.mockResolvedValue({
      encryptedTokens: "encrypted",
      lastSyncAt: null,
      syncCursor: null,
      localAiEnabled: true,
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "qwen2.5:3b",
      aiConfidenceThreshold: 0.7,
    });
    mocks.db.userSettings.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.application.findMany.mockResolvedValue([]);
    mocks.db.emailMessage.findUnique.mockResolvedValue(null);
    mocks.db.emailThread.findUnique.mockResolvedValue({
      id: "thread",
      applicationId: "app",
    });
    mocks.db.emailThread.upsert.mockResolvedValue({ id: "thread" });
    mocks.db.$transaction.mockImplementation(async (callback) =>
      callback(mocks.db),
    );
    mocks.db.application.findUniqueOrThrow.mockResolvedValue({
      id: "app",
      companyId: "company",
      status: "Awaiting reply",
      dateApplied: new Date("2026-10-01"),
      lastContactDate: null,
      repliedAt: null,
    });
    mocks.db.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme" });
    mocks.db.emailMessage.create.mockImplementation(async ({ data }) => {
      const message = { id: "cached-mail", ...data };
      mocks.db.emailMessage.findUniqueOrThrow.mockResolvedValue(message);
      return message;
    });
    mocks.gmail
      .mockResolvedValueOnce({
        messages: [{ id: "new-mail", threadId: "gmail-thread" }],
      })
      .mockResolvedValueOnce({
        id: "new-mail",
        threadId: "gmail-thread",
        internalDate: String(new Date("2026-10-08").getTime()),
        snippet: "We would like to meet.",
        payload: {
          headers: [
            { name: "From", value: "recruiter@acme.example" },
            { name: "Subject", value: "An update" },
          ],
        },
      });
  });
  it("does not apply a low-confidence result despite a confirmed application thread", async () => {
    mocks.classify.mockResolvedValue({
      source: "OLLAMA",
      needsReview: true,
      result: { ...result, confidence: 0.69 },
    });
    expect(await syncGmail()).toMatchObject({ imported: 1, review: 1 });
    expect(mocks.db.application.update).not.toHaveBeenCalled();
    expect(mocks.db.followUp.updateMany).not.toHaveBeenCalled();
    expect(mocks.db.emailMessage.create.mock.calls[0][0].data).toMatchObject({
      needsReview: true,
      classificationConfidence: 0.69,
      suggestedApplicationId: "app",
    });
  });
  it("stores a confident AI result as a suggested status without automatic changes", async () => {
    mocks.classify.mockResolvedValue({
      source: "OLLAMA",
      needsReview: false,
      result,
    });
    await syncGmail();
    expect(mocks.db.application.update).not.toHaveBeenCalled();
    expect(mocks.db.emailMessage.create.mock.calls[0][0].data).toMatchObject({
      needsReview: true,
      classification: "INTERVIEW",
      suggestedCompany: "Acme",
      suggestedRole: "Data Internship",
    });
  });
  it("preserves automatic strong deterministic updates", async () => {
    mocks.classify.mockResolvedValue({
      source: "RULES",
      needsReview: false,
      result,
    });
    await syncGmail();
    expect(mocks.db.application.update.mock.calls[0][0].data).toMatchObject({
      status: "Interview",
    });
    expect(mocks.gmail).toHaveBeenCalledTimes(2);
  });
  it("returns a fallback warning and retains the candidate for review when Ollama is unavailable", async () => {
    mocks.classify.mockResolvedValue({
      source: "RULES",
      needsReview: true,
      result: { ...result, status: "UNKNOWN", confidence: 0 },
      warning: "Ollama unavailable.",
    });
    expect(await syncGmail()).toMatchObject({
      imported: 1,
      review: 1,
      aiWarning: "Ollama unavailable.",
    });
    expect(mocks.db.application.update).not.toHaveBeenCalled();
    expect(mocks.db.emailMessage.create.mock.calls[0][0].data.aiError).toBe(
      "Ollama unavailable.",
    );
  });
  it("retrieves only the current body when the fallback requests it and never stores it", async () => {
    mocks.gmail.mockResolvedValueOnce({
      payload: {
        mimeType: "text/plain",
        body: {
          data: Buffer.from(
            "Current email body\nOn Tuesday, someone wrote:\nPrivate history",
          ).toString("base64url"),
        },
      },
    });
    mocks.classify.mockImplementation(async (_mail, _config, loadBody) => {
      expect(await loadBody()).toBe("Current email body");
      return { source: "OLLAMA", needsReview: false, result };
    });
    await syncGmail();
    expect(mocks.gmail.mock.calls[2][0]).toBe("messages/new-mail?format=full");
    const saved = mocks.db.emailMessage.create.mock.calls[0][0].data;
    expect(saved.body).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain("Private history");
    expect(JSON.stringify(saved)).not.toContain("Current email body");
  });
  it("discards a confident non-job result", async () => {
    mocks.classify.mockResolvedValue({
      source: "OLLAMA",
      needsReview: true,
      result: {
        ...result,
        isJobRelated: false,
        status: "UNKNOWN",
        company: null,
        role: null,
      },
    });
    expect(await syncGmail()).toMatchObject({ imported: 0, review: 0 });
    expect(mocks.db.emailMessage.create).not.toHaveBeenCalled();
    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });
});
