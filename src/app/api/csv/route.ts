import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { assertLocalRequest } from "@/lib/security";
import { applicationSchema, toDate } from "@/lib/validation";
import { duplicateKey, normalize } from "@/lib/domain";
export async function GET(request: NextRequest) {
  try {
    assertLocalRequest(request);
    const apps = await db.application.findMany({
      include: { company: true, contact: true },
    });
    const rows = apps.map((a) => ({
      company: a.company.name,
      jobTitle: a.jobTitle,
      location: a.location,
      jobUrl: a.jobUrl,
      dateApplied: a.dateApplied?.toISOString().slice(0, 10) || "",
      status: a.status,
      type: a.type,
      applicationId: a.applicationId || "",
      recruiterName: a.contact?.name || "",
      recruiterEmail: a.contact?.email || "",
      lastContactDate: a.lastContactDate?.toISOString().slice(0, 10) || "",
      nextFollowUpDate: a.nextFollowUpDate?.toISOString().slice(0, 10) || "",
      repliedAt: a.repliedAt?.toISOString().slice(0, 10) || "",
      assessmentDeadline:
        a.assessmentDeadline?.toISOString().slice(0, 10) || "",
      interviewAt: a.interviewAt?.toISOString().slice(0, 10) || "",
      source: a.source,
      notes: a.notes,
    }));
    const fields = [
      "company",
      "jobTitle",
      "location",
      "jobUrl",
      "dateApplied",
      "status",
      "type",
      "applicationId",
      "recruiterName",
      "recruiterEmail",
      "lastContactDate",
      "nextFollowUpDate",
      "repliedAt",
      "assessmentDeadline",
      "interviewAt",
      "source",
      "notes",
    ];
    return new Response(
      Papa.unparse({ fields, data: rows }, { escapeFormulae: true }),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="jobhunt-applications.csv"',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Export denied" }, { status: 403 });
  }
}
export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request, true);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000)
      return NextResponse.json(
        { error: "Choose a CSV file under 2 MB" },
        { status: 400 },
      );
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
    });
    if (
      parsed.errors.length ||
      !parsed.meta.fields?.includes("company") ||
      !parsed.meta.fields.includes("jobTitle") ||
      parsed.data.length > 500
    )
      return NextResponse.json(
        {
          error:
            "Invalid CSV. Include company and jobTitle, with at most 500 rows.",
        },
        { status: 400 },
      );
    let imported = 0,
      skipped = 0;
    const errors: string[] = [];
    for (const [index, row] of parsed.data.entries()) {
      const contact = row.recruiterEmail
        ? await db.contact.findUnique({
            where: { email: row.recruiterEmail.toLowerCase().trim() },
          })
        : null;
      const p = applicationSchema.safeParse({
        company: row.company,
        jobTitle: row.jobTitle,
        location: row.location || "",
        jobUrl: row.jobUrl || "",
        dateApplied: row.dateApplied || "",
        status: row.status || "Interested",
        type: row.type || "Application",
        applicationId: row.applicationId || "",
        contactId: contact?.id || "",
        lastContactDate: row.lastContactDate || "",
        nextFollowUpDate: row.nextFollowUpDate || "",
        repliedAt: row.repliedAt || "",
        assessmentDeadline: row.assessmentDeadline || "",
        interviewAt: row.interviewAt || "",
        source: row.source || "CSV import",
        notes: row.notes || "",
      });
      if (!p.success) {
        errors.push(
          `Row ${index + 2}: ${p.error.issues.map((i) => i.message).join(", ")}`,
        );
        continue;
      }
      const v = p.data;
      const key = duplicateKey(
        v.company,
        v.jobTitle,
        v.type,
        v.applicationId,
        contact?.email,
      );
      try {
        await db.$transaction(async (tx) => {
          if (
            await tx.application.findUnique({ where: { duplicateKey: key } })
          ) {
            skipped++;
            return;
          }
          const company = await tx.company.upsert({
            where: { normalizedName: normalize(v.company) },
            create: { name: v.company, normalizedName: normalize(v.company) },
            update: {},
          });
          await tx.application.create({
            data: {
              companyId: company.id,
              jobTitle: v.jobTitle,
              location: v.location,
              jobUrl: v.jobUrl,
              status: v.status,
              type: v.type,
              applicationId: v.applicationId || null,
              duplicateKey: key,
              contactId: contact?.id || null,
              dateApplied: toDate(v.dateApplied),
              lastContactDate: toDate(v.lastContactDate),
              nextFollowUpDate: toDate(v.nextFollowUpDate),
              repliedAt: toDate(v.repliedAt),
              assessmentDeadline: toDate(v.assessmentDeadline),
              interviewAt: toDate(v.interviewAt),
              source: v.source,
              notes: v.notes,
            },
          });
          imported++;
        });
      } catch {
        errors.push(`Row ${index + 2}: could not import`);
      }
    }
    return NextResponse.json({ imported, skipped, errors });
  } catch {
    return NextResponse.json(
      { error: "Import denied or failed" },
      { status: 400 },
    );
  }
}
