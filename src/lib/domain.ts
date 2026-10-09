export const STATUSES = [
  "Interested",
  "Applied",
  "Awaiting reply",
  "Recruiter contacted",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;
export type Classification =
  | "APPLICATION_CONFIRMATION"
  | "RECRUITER_REPLY"
  | "INTERVIEW"
  | "ASSESSMENT"
  | "REJECTION"
  | "OFFER"
  | "FOLLOW_UP"
  | "UNKNOWN";
export type MailInput = {
  subject: string;
  snippet: string;
  sender: string;
  threadId?: string;
  applicationId?: string;
  direction?: string;
};
export interface EmailClassifier {
  classify(message: MailInput): Classification | Promise<Classification>;
}
const rules: [Classification, RegExp][] = [
  [
    "REJECTION",
    /unfortunately|not (?:be )?moving forward|regret to inform|unsuccessful|other candidates|not selected|unable to offer|not to (?:proceed|progress)|will not (?:be )?(?:proceed|progress)|position has been filled|no longer considering/,
  ],
  [
    "OFFER",
    /offer (?:of employment|letter)|pleased to offer|job offer|employment offer|offer for the/,
  ],
  [
    "INTERVIEW",
    /interview|schedule a (?:call|meeting)|meet with (?:our|the) team/,
  ],
  [
    "ASSESSMENT",
    /assessment|coding (?:challenge|test)|online test|hackerrank|codility|technical test/,
  ],
  [
    "APPLICATION_CONFIRMATION",
    /application (?:received|submitted|confirmation)|thank you for applying|thanks for applying|received your application/,
  ],
  ["FOLLOW_UP", /following up|follow[ -]?up|checking in/],
  [
    "RECRUITER_REPLY",
    /next stage|moving forward|talent acquisition|recruiter|recruitment|your (?:application|candidacy)|availability|opportunity|internship/,
  ],
];
export function classifyEmail(mail: MailInput): Classification {
  const text = `${mail.subject} ${mail.snippet}`.toLowerCase();
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? "UNKNOWN";
}
export const deterministicClassifier: EmailClassifier = {
  classify: classifyEmail,
};
export function classifyEmailWithConfidence(mail: MailInput) {
  const status = classifyEmail(mail);
  const text = `${mail.subject} ${mail.snippet}`.toLowerCase();
  const explicit =
    /thank(?:s| you) for applying|application (?:received|confirmation)|received your application|interview invitation|invite you to (?:an? )?interview|pleased to offer|job offer|employment offer|coding (?:assessment|challenge|test)|regret to inform|not (?:be )?moving forward|not selected|unable to offer/.test(
      text,
    );
  const recruitingContext =
    /\b(?:application|candidate|candidacy|position|internship|recruiter|recruitment|hiring|employment|job)\b/.test(
      text,
    ) ||
    /workday|greenhouse|lever\.co|smartrecruiters|taleo|careers|recruit|talent/.test(
      mail.sender.toLowerCase(),
    );
  return {
    status,
    confidence:
      status === "UNKNOWN"
        ? 0
        : explicit
          ? 0.95
          : recruitingContext
            ? 0.82
            : 0.55,
    reason:
      status === "UNKNOWN"
        ? "No deterministic recruiting rule matched."
        : explicit
          ? "Explicit recruiting phrase matched deterministic rules."
          : recruitingContext
            ? "Recruiting context and a status keyword matched."
            : "Broad keyword match; classification needs review.",
  };
}
export function isJobRelated(mail: MailInput) {
  return (
    classifyEmail(mail) !== "UNKNOWN" ||
    /workday|greenhouse|lever\.co|smartrecruiters|taleo|careers|recruit|talent/.test(
      mail.sender.toLowerCase(),
    )
  );
}
export function normalize(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function duplicateKey(
  company: string,
  role: string,
  type = "Application",
  applicationId?: string | null,
  email?: string,
) {
  return `${normalize(company)}|${normalize(role)}|${type}|${normalize(applicationId || "")}${type === "Recruiter outreach" ? `|${normalize(email || "")}` : ""}`;
}
export type MatchCandidate = {
  id: string;
  jobTitle: string;
  applicationId: string | null;
  company: { name: string; domain: string | null };
  contact?: { email: string } | null;
  threads: { gmailThreadId: string }[];
};
export function matchApplication(
  mail: MailInput,
  candidates: MatchCandidate[],
) {
  const text = normalize(`${mail.subject} ${mail.snippet}`);
  const domain = mail.sender.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  const ranked = candidates
    .map((a) => {
      if (
        mail.threadId &&
        a.threads.some((t) => t.gmailThreadId === mail.threadId)
      )
        return {
          id: a.id,
          confidence: 1,
          reason: "Previously confirmed email thread",
        };
      const hasId =
        a.applicationId &&
        (mail.applicationId === a.applicationId ||
          new RegExp(
            `\\b${a.applicationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i",
          ).test(`${mail.subject} ${mail.snippet}`));
      const company = text.includes(normalize(a.company.name));
      const sender =
        !!domain &&
        !!a.company.domain &&
        domain === a.company.domain.toLowerCase();
      const role = text.includes(normalize(a.jobTitle));
      const contact =
        !!a.contact &&
        mail.sender.toLowerCase().includes(a.contact.email.toLowerCase());
      const confidence = hasId
        ? 0.98
        : Math.min(
            0.96,
            (company || sender ? 0.48 : 0) +
              (role ? 0.42 : 0) +
              (contact ? 0.08 : 0),
          );
      return {
        id: a.id,
        confidence,
        reason: hasId
          ? "Application reference ID"
          : [
              company && "company name",
              sender && "sender domain",
              role && "role title",
              contact && "contact email",
            ]
              .filter(Boolean)
              .join(" + ") || "No reliable match",
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0];
  const ambiguous = !!best && ranked[1]?.confidence >= best.confidence - 0.1;
  return best
    ? { ...best, automatic: best.confidence >= 0.85 && !ambiguous }
    : {
        id: null,
        confidence: 0,
        reason: "No existing application",
        automatic: false,
      };
}
export function addBusinessDays(date: Date, count: number) {
  const result = new Date(date);
  while (count > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (![0, 6].includes(result.getUTCDay())) count--;
  }
  return result;
}
export type FollowUpInput = {
  status: string;
  type: string;
  dateApplied: Date | null;
  lastContactDate: Date | null;
  nextFollowUpDate?: Date | null;
  repliedAt: Date | null;
  interviewAt?: Date | null;
};
export function followUpDate(a: FollowUpInput): Date | null {
  if (
    a.repliedAt ||
    a.interviewAt ||
    !["Applied", "Awaiting reply", "Recruiter contacted"].includes(a.status)
  )
    return null;
  const base = a.lastContactDate || a.dateApplied;
  if (!base) return null;
  if (a.nextFollowUpDate) return a.nextFollowUpDate;
  if (a.type === "Recruiter outreach") return addBusinessDays(base, 5);
  const due = new Date(base);
  due.setUTCDate(due.getUTCDate() + 7);
  return due;
}
export function followUpLabel(due: Date, now = new Date()) {
  const day = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((day(due) - day(now)) / 86400000);
  return days < 0
    ? `Follow-up overdue by ${-days} day${days === -1 ? "" : "s"}`
    : days === 0
      ? "Follow-up due today"
      : `Follow-up due in ${days} day${days === 1 ? "" : "s"}`;
}
export function suggestedReply(
  a: {
    jobTitle: string;
    type: string;
    company: { name: string };
    contact?: { name: string } | null;
  },
  name: string,
) {
  const firstName = a.contact?.name.trim().split(/\s+/)[0];
  return `Hi${firstName ? ` ${firstName}` : " there"},\n\nI wanted to briefly follow up ${a.type === "Recruiter outreach" ? `on my earlier message about ${a.jobTitle} opportunities at ${a.company.name}` : `regarding my application for the ${a.jobTitle} at ${a.company.name}`}.\n\nI'm still very interested in the opportunity and would be happy to provide any additional information.\n\nKind regards,\n${name}`;
}
