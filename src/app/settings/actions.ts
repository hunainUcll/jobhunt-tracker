"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/google";
import type { ActionResult } from "@/app/actions";
import { localAiSettingsSchema } from "@/lib/ai-config";
export async function updateLocalAiSettings(
  form: FormData,
): Promise<ActionResult> {
  const parsed = localAiSettingsSchema.safeParse({
    enabled: form.get("enabled") === "on",
    url: form.get("url"),
    model: form.get("model"),
    confidenceThreshold: Number(form.get("confidenceThreshold")),
  });
  if (!parsed.success)
    return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  const config = parsed.data;
  const data = {
    localAiEnabled: config.enabled,
    ollamaUrl: config.url,
    ollamaModel: config.model,
    aiConfidenceThreshold: config.confidenceThreshold,
  };
  await db.userSettings.upsert({
    where: { id: "local" },
    create: { id: "local", ...data },
    update: data,
  });
  revalidatePath("/settings");
  return {
    success:
      "Local AI settings saved. AI classifications require review before application updates.",
  };
}
export async function updateSettings(form: FormData): Promise<ActionResult> {
  const p = z
    .object({ name: z.string().trim().min(1).max(100) })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Enter a name under 100 characters." };
  await db.userSettings.upsert({
    where: { id: "local" },
    create: { id: "local", name: p.data.name },
    update: { name: p.data.name },
  });
  revalidatePath("/", "layout");
  return { success: "Settings saved" };
}
export async function disconnectGmail(): Promise<ActionResult> {
  const settings = await db.userSettings.findUnique({ where: { id: "local" } });
  if (settings?.syncLeaseUntil && settings.syncLeaseUntil > new Date())
    return {
      error: "Wait for the current sync to finish before disconnecting.",
    };
  let revoked = true;
  try {
    if (settings?.encryptedTokens) {
      const tokens = decrypt(settings.encryptedTokens);
      const r = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: tokens.refresh_token || tokens.access_token,
        }),
        signal: AbortSignal.timeout(10000),
      });
      revoked = r.ok;
    }
  } catch {
    revoked = false;
  }
  await db.$transaction(async (tx) => {
    await tx.emailMessage.deleteMany();
    await tx.emailThread.deleteMany();
    await tx.followUp.updateMany({
      data: { draftId: null, suggestedText: "" },
    });
    await tx.activity.deleteMany({
      where: {
        kind: {
          in: [
            "APPLICATION_CONFIRMATION",
            "RECRUITER_REPLY",
            "INTERVIEW",
            "ASSESSMENT",
            "REJECTION",
            "OFFER",
            "FOLLOW_UP",
            "DRAFT",
          ],
        },
      },
    });
    await tx.userSettings.upsert({
      where: { id: "local" },
      create: { id: "local" },
      update: {
        gmailEmail: null,
        encryptedTokens: null,
        gmailScopes: "",
        lastSyncAt: null,
        syncCursor: null,
        syncLeaseUntil: null,
      },
    });
  });
  revalidatePath("/", "layout");
  return {
    success: `Gmail disconnected and cached messages deleted. Applications and contacts retained.${revoked ? "" : " Google revocation could not be confirmed; remove access in your Google Account permissions."}`,
  };
}
