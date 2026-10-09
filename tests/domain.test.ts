import { describe, it, expect } from "vitest";
import {
  classifyEmail,
  isJobRelated,
  matchApplication,
  duplicateKey,
  followUpDate,
  followUpLabel,
  addBusinessDays,
  suggestedReply,
} from "../src/lib/domain";
const mail = (subject: string, snippet = "") => ({
  subject,
  snippet,
  sender: "Hiring <careers@acme.example>",
});
describe("email classification", () => {
  it.each([
    ["Thank you for applying", "APPLICATION_CONFIRMATION"],
    ["Interview invitation", "INTERVIEW"],
    ["Coding assessment", "ASSESSMENT"],
    ["Unfortunately we cannot continue", "REJECTION"],
    ["We are pleased to offer you the position", "OFFER"],
    ["Your application: next stage", "RECRUITER_REPLY"],
    ["Following up on your application", "FOLLOW_UP"],
    ["Dinner on Friday", "UNKNOWN"],
  ] as const)("classifies %s", (subject, classification) =>
    expect(classifyEmail(mail(subject))).toBe(classification),
  );
  it("prioritizes rejection over offer and interview keywords", () =>
    expect(
      classifyEmail(mail("Unfortunately, we are unable to offer an interview")),
    ).toBe("REJECTION"));
  it("does not treat a marketing offer as a job offer", () =>
    expect(classifyEmail(mail("Special offer: shoes at 50% off"))).toBe(
      "UNKNOWN",
    ));
  it("recognizes ATS candidates without inventing a classification", () => {
    expect(
      isJobRelated({ ...mail("Update"), sender: "noreply@myworkday.com" }),
    ).toBe(true);
    expect(classifyEmail(mail("Update"))).toBe("UNKNOWN");
  });
  it("rejects unrelated personal email", () =>
    expect(
      isJobRelated({ ...mail("Dinner"), sender: "friend@example.org" }),
    ).toBe(false));
});
const candidate = {
  id: "one",
  jobTitle: "Data & AI Internship",
  applicationId: "APP-42",
  company: { name: "Acme", domain: "acme.example" },
  contact: { email: "sarah@acme.example" },
  threads: [{ gmailThreadId: "confirmed-thread" }],
};
describe("application matching", () => {
  it("uses a previously confirmed thread", () =>
    expect(
      matchApplication(
        { ...mail("Quick update"), threadId: "confirmed-thread" },
        [candidate],
      ),
    ).toMatchObject({ id: "one", automatic: true, confidence: 1 }));
  it("matches exact application reference", () =>
    expect(matchApplication(mail("APP-42: update"), [candidate])).toMatchObject(
      { automatic: true, confidence: 0.98 },
    ));
  it("does not match a substring of an application reference", () =>
    expect(
      matchApplication(mail("APP-420: update"), [candidate]).automatic,
    ).toBe(false));
  it("matches company and role together", () =>
    expect(
      matchApplication(mail("Acme Data & AI Internship"), [candidate]),
    ).toMatchObject({ automatic: true }));
  it("does not silently match company-only mail", () =>
    expect(matchApplication(mail("Acme: update"), [candidate]).automatic).toBe(
      false,
    ));
  it("matches role with company domain", () =>
    expect(
      matchApplication(mail("Data & AI Internship"), [candidate]).automatic,
    ).toBe(true));
  it("does not mistake an ATS domain for a company", () =>
    expect(
      matchApplication({ ...mail("Update"), sender: "noreply@greenhouse.io" }, [
        candidate,
      ]).automatic,
    ).toBe(false));
  it("requires review for tied matches", () =>
    expect(
      matchApplication(mail("Acme Data & AI Internship"), [
        candidate,
        { ...candidate, id: "two" },
      ]).automatic,
    ).toBe(false));
  it("returns no match for unrelated mail", () =>
    expect(
      matchApplication(
        { ...mail("Pizza party"), sender: "friend@example.org" },
        [candidate],
      ),
    ).toMatchObject({ automatic: false, confidence: 0 }));
  it("handles an empty candidate list", () =>
    expect(matchApplication(mail("Update"), [])).toMatchObject({
      id: null,
      automatic: false,
    }));
});
const application = {
  status: "Awaiting reply",
  type: "Application",
  dateApplied: new Date("2026-10-08T12:00:00Z"),
  lastContactDate: null,
  repliedAt: null,
};
describe("follow-up calculation", () => {
  it("adds seven calendar days", () =>
    expect(followUpDate(application)?.toISOString()).toBe(
      "2026-10-15T12:00:00.000Z",
    ));
  it("adds five business days for outreach", () =>
    expect(
      followUpDate({
        ...application,
        type: "Recruiter outreach",
      })?.toISOString(),
    ).toBe("2026-10-15T12:00:00.000Z"));
  it("skips weekends when starting Friday", () =>
    expect(
      addBusinessDays(new Date("2026-10-09T12:00:00Z"), 5).toISOString(),
    ).toBe("2026-10-16T12:00:00.000Z"));
  it.each([
    "Rejected",
    "Offer",
    "Interview",
    "Assessment",
    "Withdrawn",
    "Interested",
  ])("does not follow up on %s", (status) =>
    expect(followUpDate({ ...application, status })).toBeNull(),
  );
  it("stops after a recruiter reply", () =>
    expect(followUpDate({ ...application, repliedAt: new Date() })).toBeNull());
  it("stops when an interview is scheduled", () =>
    expect(
      followUpDate({ ...application, interviewAt: new Date() }),
    ).toBeNull());
  it("uses last contact after a user records a sent follow-up", () =>
    expect(
      followUpDate({
        ...application,
        lastContactDate: new Date("2026-10-10T12:00:00Z"),
      })?.toISOString(),
    ).toBe("2026-10-17T12:00:00.000Z"));
  it("allows a manual date override", () =>
    expect(
      followUpDate({
        ...application,
        nextFollowUpDate: new Date("2026-10-20T12:00:00Z"),
      })?.toISOString(),
    ).toBe("2026-10-20T12:00:00.000Z"));
  it("does not use override after a reply", () =>
    expect(
      followUpDate({
        ...application,
        repliedAt: new Date(),
        nextFollowUpDate: new Date(),
      }),
    ).toBeNull());
  it("needs an initial contact date", () =>
    expect(followUpDate({ ...application, dateApplied: null })).toBeNull());
  it("labels future dates", () =>
    expect(followUpLabel(new Date("2026-10-15"), new Date("2026-10-08"))).toBe(
      "Follow-up due in 7 days",
    ));
  it("labels overdue dates", () =>
    expect(followUpLabel(new Date("2026-10-07"), new Date("2026-10-08"))).toBe(
      "Follow-up overdue by 1 day",
    ));
  it("labels today by calendar day, not hours", () =>
    expect(
      followUpLabel(
        new Date("2026-10-08T01:00Z"),
        new Date("2026-10-08T23:00Z"),
      ),
    ).toBe("Follow-up due today"));
});
describe("duplicate detection", () => {
  it("normalizes case, whitespace and punctuation", () =>
    expect(duplicateKey(" Acme ", "Data & AI Internship")).toBe(
      duplicateKey("ACME", "data ai internship"),
    ));
  it("keeps distinct jobs separate", () =>
    expect(duplicateKey("Acme", "Analyst")).not.toBe(
      duplicateKey("Acme", "Engineer"),
    ));
  it("keeps application and outreach separate", () =>
    expect(duplicateKey("Acme", "Analyst")).not.toBe(
      duplicateKey("Acme", "Analyst", "Recruiter outreach"),
    ));
  it("keeps explicit different application references separate", () =>
    expect(duplicateKey("Acme", "Analyst", "Application", "A-1")).not.toBe(
      duplicateKey("Acme", "Analyst", "Application", "A-2"),
    ));
  it("keeps outreach to distinct contacts separate", () =>
    expect(
      duplicateKey(
        "Acme",
        "Analyst",
        "Recruiter outreach",
        null,
        "a@example.org",
      ),
    ).not.toBe(
      duplicateKey(
        "Acme",
        "Analyst",
        "Recruiter outreach",
        null,
        "b@example.org",
      ),
    ));
});
describe("suggested replies", () => {
  it("uses only supplied facts and a first-name greeting", () => {
    const reply = suggestedReply(
      {
        jobTitle: "Data Internship",
        type: "Application",
        company: { name: "Acme" },
        contact: { name: "Sarah Example" },
      },
      "Alex",
    );
    expect(reply).toContain("Hi Sarah,");
    expect(reply).toContain("Data Internship at Acme");
    expect(reply).toContain("Kind regards,\nAlex");
    expect(reply).not.toContain("experience");
  });
  it("references prior outreach without inventing conversation facts", () =>
    expect(
      suggestedReply(
        {
          jobTitle: "Graduate",
          type: "Recruiter outreach",
          company: { name: "Acme" },
        },
        "Alex",
      ),
    ).toContain("on my earlier message"));
});
