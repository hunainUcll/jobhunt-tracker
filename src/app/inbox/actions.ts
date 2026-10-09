"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { applyMessageToApplication } from "@/lib/mail-sync";
import type { ActionResult } from "@/app/actions";
import { z } from "zod";
import { CLASSIFICATIONS } from "@/lib/ai-config";
export async function confirmMatch(
  messageId: string,
  applicationId: string,
  approvedStatus?: string,
): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      const m = await tx.emailMessage.findUniqueOrThrow({
        where: { id: messageId },
        include: { thread: true },
      });
      await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
      const status = z
        .enum(CLASSIFICATIONS)
        .parse(approvedStatus || m.classification);
      if (m.thread.applicationId && m.thread.applicationId !== applicationId)
        throw new Error(
          "This thread is already linked to a different application.",
        );
      await tx.emailThread.update({
        where: { id: m.threadId },
        data: { applicationId },
      });
      const messages = await tx.emailMessage.findMany({
        where: { threadId: m.threadId, dismissed: false },
        orderBy: { receivedAt: "asc" },
      });
      await tx.emailMessage.update({
        where: { id: messageId },
        data: { classification: status, needsReview: false },
      });
      for (const mail of messages) {
        if (mail.id === messageId)
          await applyMessageToApplication(tx, mail.id, applicationId, true);
        else if (
          !mail.needsReview &&
          mail.classificationSource !== "OLLAMA" &&
          mail.classificationConfidence >= 0.7
        )
          await applyMessageToApplication(tx, mail.id, applicationId);
      }
      await tx.activity.create({
        data: {
          applicationId,
          message: "User confirmed an email match and status suggestion",
        },
      });
    });
    revalidatePath("/", "layout");
    return { success: "Thread confirmed and application updated" };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not confirm match",
    };
  }
}
export async function dismissMessage(id: string) {
  await db.emailMessage.update({
    where: { id },
    data: { dismissed: true, reviewed: true },
  });
  revalidatePath("/inbox");
}
