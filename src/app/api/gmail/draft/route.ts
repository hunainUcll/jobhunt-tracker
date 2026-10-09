import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertLocalRequest } from "@/lib/security";
import { gmail, DRAFT_SCOPE } from "@/lib/google";
import { followUpDate } from "@/lib/domain";
const schema = z.object({
  applicationId: z.string().min(1),
  to: z
    .email()
    .max(254)
    .refine((v) => !/[\r\n]/.test(v)),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/[\r\n]/.test(v)),
  text: z.string().trim().min(1).max(10000),
});
export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request, true);
    const settings = await db.userSettings.findUnique({
      where: { id: "local" },
    });
    if (!settings?.gmailScopes.split(" ").includes(DRAFT_SCOPE))
      return NextResponse.json(
        { error: "Enable optional draft permission in Settings first." },
        { status: 403 },
      );
    const p = schema.safeParse(await request.json());
    if (!p.success)
      return NextResponse.json(
        {
          error:
            "Enter a valid recipient, subject, and message. Newlines are not allowed in headers.",
        },
        { status: 400 },
      );
    const { applicationId, to, subject, text } = p.data;
    const a = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    const due = followUpDate(a);
    if (!due)
      return NextResponse.json(
        { error: "This application no longer needs a follow-up." },
        { status: 409 },
      );
    // Draft endpoint only. There is intentionally no Gmail send operation in this application.
    const mime = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(text.replace(/\r?\n/g, "\r\n"))
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") || "",
    ].join("\r\n");
    const draft = await gmail<{ id: string; message: { id: string } }>(
      "drafts",
      {
        method: "POST",
        body: JSON.stringify({
          message: { raw: Buffer.from(mime).toString("base64url") },
        }),
      },
    );
    await db.$transaction(async (tx) => {
      const f = await tx.followUp.findFirst({
        where: { applicationId, completedAt: null },
      });
      if (f)
        await tx.followUp.update({
          where: { id: f.id },
          data: { draftId: draft.id, suggestedText: text },
        });
      else
        await tx.followUp.create({
          data: {
            applicationId,
            dueAt: due,
            draftId: draft.id,
            suggestedText: text,
          },
        });
      await tx.activity.create({
        data: {
          applicationId,
          message: "Gmail draft created by user. Nothing was sent.",
          kind: "DRAFT",
        },
      });
    });
    return NextResponse.json({
      draftId: draft.id,
      messageId: draft.message.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create draft" },
      { status: 400 },
    );
  }
}
