import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ db: {}, gmail: vi.fn() }));
vi.mock("../src/lib/db", () => ({ db: mocks.db }));
vi.mock("../src/lib/google", () => ({ gmail: mocks.gmail }));
import { applyMessageToApplication, decodeSnippet } from "../src/lib/mail-sync";
const message = {
  id: "mail",
  direction: "INBOUND",
  classification: "INTERVIEW",
  receivedAt: new Date("2026-10-08"),
  notified: false,
  needsReview: false,
  classificationConfidence: 0.95,
  classificationSource: "RULES",
};
const app: {
  id: string;
  companyId: string;
  status: string;
  dateApplied: Date;
  lastContactDate: Date | null;
  repliedAt: Date | null;
} = {
  id: "app",
  companyId: "company",
  status: "Awaiting reply",
  dateApplied: new Date("2026-10-01"),
  lastContactDate: null,
  repliedAt: null,
};
function transaction(m = message, a = app) {
  return {
    emailMessage: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(m),
      update: vi.fn(),
    },
    application: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(a),
      update: vi.fn(),
    },
    company: { findUniqueOrThrow: vi.fn().mockResolvedValue({ name: "Acme" }) },
    followUp: { updateMany: vi.fn() },
    activity: { create: vi.fn() },
  };
}
describe("conservative email application updates", () => {
  beforeEach(() => vi.clearAllMocks());
  it("stops follow-ups and notifies on an interview", async () => {
    const tx = transaction();
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update).toHaveBeenCalledWith({
      where: { id: "app" },
      data: {
        status: "Interview",
        repliedAt: message.receivedAt,
        nextFollowUpDate: null,
      },
    });
    expect(tx.followUp.updateMany).toHaveBeenCalled();
    expect(tx.activity.create).toHaveBeenCalled();
  });
  it("does not undo an interview with a confirmation", async () => {
    const tx = transaction(
      { ...message, classification: "APPLICATION_CONFIRMATION" },
      { ...app, status: "Interview" },
    );
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update).toHaveBeenCalledWith({
      where: { id: "app" },
      data: {},
    });
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
  it.each(["Rejected", "Offer", "Withdrawn"])(
    "preserves manual terminal status %s",
    async (status) => {
      const tx = transaction(message, { ...app, status });
      await applyMessageToApplication(
        tx as unknown as Prisma.TransactionClient,
        "mail",
        "app",
      );
      const update = tx.application.update.mock.calls[0][0];
      expect(update.data.status).toBeUndefined();
    },
  );
  it("does not downgrade a newer interview from an old assessment email", async () => {
    const tx = transaction(
      {
        ...message,
        classification: "ASSESSMENT",
        receivedAt: new Date("2026-10-02"),
      },
      {
        ...app,
        status: "Interview",
        repliedAt: new Date("2026-10-07"),
      } as typeof app,
    );
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update).toHaveBeenCalledWith({
      where: { id: "app" },
      data: {},
    });
  });
  it("does not count sent mail as a recruiter response", async () => {
    const tx = transaction({ ...message, direction: "OUTBOUND" });
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update.mock.calls[0][0].data).toEqual({
      lastContactDate: message.receivedAt,
      nextFollowUpDate: null,
    });
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
  it("does not repeat notifications for an already-notified message", async () => {
    const tx = transaction({ ...message, notified: true });
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
  it("limits cached snippets and decodes common HTML entities", () => {
    expect(decodeSnippet("Data &amp; AI")).toBe("Data & AI");
    expect(decodeSnippet("a".repeat(600))).toHaveLength(500);
  });
  it("never automatically applies a low-confidence result, even in a matched thread", async () => {
    const tx = transaction({
      ...message,
      classificationConfidence: 0.69,
      needsReview: true,
    });
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(tx.followUp.updateMany).not.toHaveBeenCalled();
    expect(tx.emailMessage.update).not.toHaveBeenCalled();
  });
  it("keeps confident Ollama results as suggestions until approved", async () => {
    const tx = transaction({
      ...message,
      classificationSource: "OLLAMA",
      classificationConfidence: 0.99,
    });
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
    );
    expect(tx.application.update).not.toHaveBeenCalled();
  });
  it("applies a classification only when the user explicitly approves it", async () => {
    const tx = transaction({
      ...message,
      classificationSource: "OLLAMA",
      classificationConfidence: 0.6,
      needsReview: true,
    });
    await applyMessageToApplication(
      tx as unknown as Prisma.TransactionClient,
      "mail",
      "app",
      true,
    );
    expect(tx.application.update.mock.calls[0][0].data.status).toBe(
      "Interview",
    );
  });
});
