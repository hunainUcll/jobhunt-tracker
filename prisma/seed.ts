import { PrismaClient } from "@prisma/client";
import { duplicateKey } from "../src/lib/domain";
const db = new PrismaClient();
const ago = (n: number) => new Date(Date.now() - n * 86400000);
async function seed() {
  await db.userSettings.upsert({
    where: { id: "local" },
    create: { id: "local" },
    update: {},
  });
  const examples = [
    {
      company: "Proximus",
      domain: "proximus.example",
      role: "Data & AI Internship",
      status: "Awaiting reply",
      days: 9,
      contact: "Mila Example",
      type: "Application",
    },
    {
      company: "KBC",
      domain: "kbc.example",
      role: "Graduate Data Analyst",
      status: "Recruiter contacted",
      days: 8,
      contact: "Noah Sample",
      type: "Recruiter outreach",
    },
    {
      company: "Deloitte",
      domain: "deloitte.example",
      role: "Technology Consulting Internship",
      status: "Interview",
      days: 4,
      contact: "Lena Fiction",
      type: "Application",
    },
    {
      company: "Microsoft",
      domain: "microsoft.example",
      role: "Software Engineering Internship",
      status: "Assessment",
      days: 3,
      contact: "Eli Demo",
      type: "Application",
    },
    {
      company: "Accenture",
      domain: "accenture.example",
      role: "Graduate Technology Analyst",
      status: "Applied",
      days: 2,
      contact: "Ava Placeholder",
      type: "Application",
    },
  ];
  for (const e of examples) {
    const company = await db.company.upsert({
      where: { normalizedName: e.company.toLowerCase() },
      create: {
        name: e.company,
        normalizedName: e.company.toLowerCase(),
        domain: e.domain,
      },
      update: {},
    });
    const contact = await db.contact.upsert({
      where: { email: `${e.contact.split(" ")[0].toLowerCase()}@${e.domain}` },
      create: {
        name: e.contact,
        companyId: company.id,
        email: `${e.contact.split(" ")[0].toLowerCase()}@${e.domain}`,
        jobTitle: "Campus recruiter",
        lastContacted: ago(e.days),
        notes: "Fictional example contact.",
      },
      update: {},
    });
    const key = duplicateKey(e.company, e.role, e.type, null, contact.email);
    const exists = await db.application.findUnique({
      where: { duplicateKey: key },
    });
    if (exists) continue;
    const application = await db.application.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        jobTitle: e.role,
        location: "Brussels, Belgium",
        status: e.status,
        type: e.type,
        dateApplied: ago(e.days),
        lastContactDate: ago(e.days),
        duplicateKey: key,
        source: "Example data",
        notes: "Fictional example. Replace with your own application.",
        repliedAt: ["Interview", "Assessment"].includes(e.status)
          ? ago(1)
          : null,
        assessmentDeadline:
          e.status === "Assessment" ? new Date(Date.now() + 86400000) : null,
      },
    });
    await db.activity.create({
      data: {
        applicationId: application.id,
        message: `${e.company} · ${e.status}`,
        kind: e.status === "Interview" ? "INTERVIEW" : "UPDATE",
      },
    });
    if (["Interview", "Assessment"].includes(e.status)) {
      const classification =
        e.status === "Interview" ? "INTERVIEW" : "ASSESSMENT";
      await db.emailThread.create({
        data: {
          gmailThreadId: `demo-${company.id}`,
          applicationId: application.id,
          subject: `${e.role} — ${e.status}`,
          messages: {
            create: {
              gmailMessageId: `demo-${application.id}`,
              sender: `${contact.name} <${contact.email}>`,
              subject: `${e.role} — ${e.status}`,
              snippet:
                e.status === "Interview"
                  ? "We would like to invite you to an interview. Please share your availability."
                  : "Please complete your coding assessment. Example deadline: tomorrow.",
              classification,
              receivedAt: ago(1),
              reviewed: true,
              matchConfidence: 1,
              matchReason: "Fictional seed example",
            },
          },
        },
      });
    }
  }
  console.log("Seed ready: five fictional applications and contacts.");
}
seed().finally(() => db.$disconnect());
