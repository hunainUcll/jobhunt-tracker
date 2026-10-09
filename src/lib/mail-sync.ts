import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { gmail } from "./google";
import { matchApplication } from "./domain";
import { configFromSettings } from "./ai-config";
import { classifyForSync } from "./local-ai";
import { extractEmailBody, type GmailPart } from "./email-body";
export const RECRUITING_QUERY =
  '-in:spam -in:trash {"application received" "thank you for applying" "application confirmation" "your application" "interview" "assessment" "next stage" "moving forward" "talent acquisition" "recruiter" "job offer" "following up" from:myworkday.com from:greenhouse.io from:lever.co from:smartrecruiters.com from:taleo.net}';
type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};
type Tx = Prisma.TransactionClient;
export function decodeSnippet(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, 500);
}
export async function applyMessageToApplication(
  tx: Tx,
  messageId: string,
  applicationId: string,
  approved = false,
) {
  const m = await tx.emailMessage.findUniqueOrThrow({
    where: { id: messageId },
  });
  const a = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
  });
  // An AI result is always a suggestion. Review approval is separate from a thread match.
  if (
    !approved &&
    (m.needsReview ||
      m.classificationSource === "OLLAMA" ||
      m.classificationConfidence < 0.7)
  )
    return;
  await tx.emailMessage.update({
    where: { id: m.id },
    data: { reviewed: true, suggestedApplicationId: applicationId },
  });
  if (m.direction === "OUTBOUND") {
    if (!a.lastContactDate || m.receivedAt > a.lastContactDate)
      await tx.application.update({
        where: { id: a.id },
        data: { lastContactDate: m.receivedAt, nextFollowUpDate: null },
      });
    return;
  }
  const isReply = [
    "RECRUITER_REPLY",
    "INTERVIEW",
    "ASSESSMENT",
    "REJECTION",
    "OFFER",
    "FOLLOW_UP",
  ].includes(m.classification);
  const statusMap: Record<string, string> = {
    APPLICATION_CONFIRMATION: "Awaiting reply",
    RECRUITER_REPLY: "Recruiter contacted",
    INTERVIEW: "Interview",
    ASSESSMENT: "Assessment",
    REJECTION: "Rejected",
    OFFER: "Offer",
    FOLLOW_UP: "Recruiter contacted",
  };
  const newerThanReply = !a.repliedAt || m.receivedAt >= a.repliedAt;
  const relevantDate = !a.dateApplied || m.receivedAt >= a.dateApplied;
  // A late confirmation or older mail must never undo progress or a manual terminal status.
  const canStatusChange =
    relevantDate &&
    newerThanReply &&
    !["Rejected", "Offer", "Withdrawn"].includes(a.status) &&
    !(
      m.classification === "APPLICATION_CONFIRMATION" &&
      !["Interested", "Applied", "Awaiting reply"].includes(a.status)
    ) &&
    !(
      m.classification === "RECRUITER_REPLY" &&
      ["Interview", "Assessment"].includes(a.status)
    );
  await tx.application.update({
    where: { id: a.id },
    data: {
      ...(canStatusChange && statusMap[m.classification]
        ? { status: statusMap[m.classification] }
        : {}),
      ...(isReply && newerThanReply && relevantDate
        ? { repliedAt: m.receivedAt, nextFollowUpDate: null }
        : {}),
    },
  });
  if (isReply && relevantDate)
    await tx.followUp.updateMany({
      where: { applicationId: a.id, completedAt: null },
      data: { completedAt: new Date() },
    });
  if (!m.notified && isReply) {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: a.companyId },
    });
    await tx.activity.create({
      data: {
        applicationId: a.id,
        message: `${m.classification.replaceAll("_", " ")} from ${company.name} · ${m.subject}`,
        kind: m.classification,
      },
    });
    await tx.emailMessage.update({
      where: { id: m.id },
      data: { notified: true },
    });
  }
}
export async function syncGmail() {
  const settings = await db.userSettings.findUnique({ where: { id: "local" } });
  if (!settings?.encryptedTokens)
    throw new Error("Connect Gmail in Settings first.");
  const acquired = await db.userSettings.updateMany({
    where: {
      id: "local",
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }],
    },
    data: { syncLeaseUntil: new Date(Date.now() + 10 * 60 * 1000) },
  });
  if (!acquired.count)
    throw new Error("A sync is already running. Please wait.");
  let imported = 0,
    review = 0;
  const aiConfig = configFromSettings(settings);
  let aiWarning: string | undefined;
  let localAiUnavailable = false;
  try {
    const after = settings.lastSyncAt
      ? `after:${Math.floor((settings.lastSyncAt.getTime() - 7 * 86400000) / 1000)}`
      : "newer_than:90d";
    const params = new URLSearchParams({
      q: `${RECRUITING_QUERY} ${after}`,
      maxResults: "100",
    });
    if (settings.syncCursor) params.set("pageToken", settings.syncCursor);
    const page = await gmail<{
      messages?: { id: string; threadId: string }[];
      nextPageToken?: string;
    }>(`messages?${params}`);
    const candidates = await db.application.findMany({
      include: { company: true, contact: true, threads: true },
    });
    // Process a bounded page in chronological order. Never retrieve an entire mailbox or thread.
    const fetched: GmailMessage[] = [];
    for (const item of page.messages || []) {
      await db.userSettings.update({
        where: { id: "local" },
        data: { syncLeaseUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });
      if (
        await db.emailMessage.findUnique({ where: { gmailMessageId: item.id } })
      )
        continue;
      fetched.push(
        await gmail<GmailMessage>(
          `messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
        ),
      );
    }
    fetched.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    for (const item of fetched) {
      await db.userSettings.update({
        where: { id: "local" },
        data: { syncLeaseUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });
      const header = (name: string) =>
        item.payload?.headers?.find(
          (h) => h.name.toLowerCase() === name.toLowerCase(),
        )?.value || "";
      const mail = {
        sender: header("From"),
        subject: header("Subject"),
        snippet: decodeSnippet(item.snippet || ""),
        threadId: item.threadId,
      };
      const direction = item.labelIds?.includes("SENT")
        ? "OUTBOUND"
        : "INBOUND";
      const knownThread = await db.emailThread.findUnique({
        where: { gmailThreadId: item.threadId },
      });
      const decision = await classifyForSync(
        mail,
        { ...aiConfig, enabled: aiConfig.enabled && !localAiUnavailable },
        async () => {
          const full = await gmail<GmailMessage>(
            `messages/${encodeURIComponent(item.id)}?format=full`,
          );
          return extractEmailBody(full.payload, mail.snippet);
        },
      );
      if (decision.warning) {
        aiWarning = decision.warning;
        if (
          /unavailable|timed out|not found|Cloud-backed|Could not verify/i.test(
            decision.warning,
          )
        )
          localAiUnavailable = true;
      }
      const threshold = Math.max(0.7, aiConfig.confidenceThreshold);
      if (
        !decision.result.isJobRelated &&
        decision.result.confidence >= threshold
      )
        continue;
      if (
        !decision.result.isJobRelated &&
        !knownThread?.applicationId &&
        !aiConfig.enabled
      )
        continue;
      const classification =
        direction === "OUTBOUND" && decision.result.isJobRelated
          ? "FOLLOW_UP"
          : decision.result.status;
      const needsReview =
        decision.needsReview ||
        decision.source === "OLLAMA" ||
        !decision.result.isJobRelated;
      // Extracted company/role can guide a suggestion, never an automatic match.
      const matchMail =
        decision.source === "OLLAMA"
          ? {
              ...mail,
              snippet: `${mail.snippet} ${decision.result.company || ""} ${decision.result.role || ""}`,
            }
          : mail;
      const match = knownThread?.applicationId
        ? {
            id: knownThread.applicationId,
            confidence: 1,
            reason: "Previously confirmed thread",
            automatic: true,
          }
        : matchApplication(matchMail, candidates);
      const autoApply = match.automatic && !needsReview;
      await db.$transaction(async (tx) => {
        const thread = await tx.emailThread.upsert({
          where: { gmailThreadId: item.threadId },
          create: {
            gmailThreadId: item.threadId,
            subject: mail.subject,
            applicationId: autoApply ? match.id : null,
          },
          update: {},
        });
        const message = await tx.emailMessage.create({
          data: {
            gmailMessageId: item.id,
            threadId: thread.id,
            sender: mail.sender,
            recipient: header("To"),
            subject: mail.subject,
            snippet: mail.snippet,
            classification,
            classificationConfidence: decision.result.confidence,
            classificationSource: decision.source,
            classificationReason: decision.result.reason,
            suggestedCompany: decision.result.company,
            suggestedRole: decision.result.role,
            needsReview,
            aiError: decision.warning || null,
            receivedAt: new Date(Number(item.internalDate)),
            direction,
            matchConfidence: match.confidence,
            matchReason: match.reason,
            suggestedApplicationId: match.confidence > 0 ? match.id : null,
          },
        });
        if (autoApply && match.id)
          await applyMessageToApplication(tx, message.id, match.id);
        else {
          review++;
          if (
            direction === "INBOUND" &&
            [
              "INTERVIEW",
              "ASSESSMENT",
              "OFFER",
              "RECRUITER_REPLY",
              "REJECTION",
              "FOLLOW_UP",
            ].includes(classification)
          ) {
            await tx.activity.create({
              data: {
                message: `${classification.replaceAll("_", " ")} · ${mail.subject} · match needs review`,
                kind: classification,
              },
            });
            await tx.emailMessage.update({
              where: { id: message.id },
              data: { notified: true },
            });
          }
        }
      });
      imported++;
    }
    await db.userSettings.update({
      where: { id: "local" },
      data: {
        syncCursor: page.nextPageToken || null,
        ...(!page.nextPageToken ? { lastSyncAt: new Date() } : {}),
      },
    });
    return { imported, review, hasMore: !!page.nextPageToken, aiWarning };
  } finally {
    await db.userSettings.update({
      where: { id: "local" },
      data: { syncLeaseUntil: null },
    });
  }
}
