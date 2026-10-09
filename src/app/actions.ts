"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { applicationSchema, contactSchema, toDate } from "@/lib/validation";
import { duplicateKey, normalize } from "@/lib/domain";
export type ActionResult = { error?: string; success?: string; id?: string };
function refresh() {
  ["/dashboard", "/applications", "/contacts", "/follow-ups", "/inbox"].forEach(
    (p) => revalidatePath(p),
  );
}
export async function saveApplication(
  form: FormData,
  id?: string,
): Promise<ActionResult> {
  const parsed = applicationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  const v = parsed.data;
  try {
    const result = await db.$transaction(async (tx) => {
      const company = await tx.company.upsert({
        where: { normalizedName: normalize(v.company) },
        create: { name: v.company, normalizedName: normalize(v.company) },
        update: {},
      });
      const contact = v.contactId
        ? await tx.contact.findUnique({ where: { id: v.contactId } })
        : null;
      if (v.contactId && !contact) throw new Error("Contact no longer exists.");
      const key = duplicateKey(
        v.company,
        v.jobTitle,
        v.type,
        v.applicationId,
        contact?.email,
      );
      const duplicate = await tx.application.findUnique({
        where: { duplicateKey: key },
      });
      if (duplicate && duplicate.id !== id)
        throw new Error(
          "This application already exists. Open the existing entry instead.",
        );
      const data = {
        companyId: company.id,
        jobTitle: v.jobTitle,
        location: v.location,
        jobUrl: v.jobUrl,
        dateApplied: toDate(v.dateApplied),
        status: v.status,
        type: v.type,
        applicationId: v.applicationId || null,
        duplicateKey: key,
        contactId: v.contactId || null,
        lastContactDate: toDate(v.lastContactDate),
        nextFollowUpDate: toDate(v.nextFollowUpDate),
        repliedAt: toDate(v.repliedAt),
        assessmentDeadline: toDate(v.assessmentDeadline),
        interviewAt: toDate(v.interviewAt),
        source: v.source,
        notes: v.notes,
      };
      const application = id
        ? await tx.application.update({ where: { id }, data })
        : await tx.application.create({ data });
      await tx.activity.create({
        data: {
          applicationId: application.id,
          message: `${id ? "Updated" : "Added"} ${v.company} · ${v.jobTitle}`,
        },
      });
      return application;
    });
    refresh();
    if (id) revalidatePath(`/applications/${id}`);
    return { id: result.id, success: "Application saved" };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not save application",
    };
  }
}
export async function saveContact(
  form: FormData,
  id?: string,
): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  try {
    const v = parsed.data;
    const company = await db.company.upsert({
      where: { normalizedName: normalize(v.company) },
      create: { name: v.company, normalizedName: normalize(v.company) },
      update: {},
    });
    const data = {
      name: v.name,
      companyId: company.id,
      jobTitle: v.jobTitle,
      email: v.email,
      linkedInUrl: v.linkedInUrl,
      lastContacted: toDate(v.lastContacted),
      notes: v.notes,
    };
    const contact = id
      ? await db.contact.update({ where: { id }, data })
      : await db.contact.create({ data });
    refresh();
    return { id: contact.id, success: "Contact saved" };
  } catch {
    return { error: "Could not save contact. Check that the email is unique." };
  }
}
export async function recordContact(id: string): Promise<ActionResult> {
  const app = await db.application.findUnique({ where: { id } });
  if (!app) return { error: "Application not found" };
  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: { lastContactDate: new Date(), nextFollowUpDate: null },
    });
    await tx.followUp.updateMany({
      where: { applicationId: id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (app.contactId)
      await tx.contact.update({
        where: { id: app.contactId },
        data: { lastContacted: new Date() },
      });
    await tx.activity.create({
      data: {
        applicationId: id,
        message: "User recorded a sent follow-up",
        kind: "FOLLOW_UP",
      },
    });
  });
  refresh();
  revalidatePath(`/applications/${id}`);
  return {
    success: "Contact date updated. Next follow-up will use this date.",
  };
}
export async function markNotificationsRead() {
  await db.activity.updateMany({
    where: { read: false },
    data: { read: true },
  });
  refresh();
}
