import { z } from "zod";
import { STATUSES } from "./domain";
const optionalDate = z
  .string()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Invalid date");
const url = z
  .string()
  .max(2000)
  .refine((v) => !v || /^https?:\/\//i.test(v), "Use an http or https URL");
export const applicationSchema = z.object({
  company: z.string().trim().min(1).max(150),
  jobTitle: z.string().trim().min(1).max(200),
  location: z.string().max(200),
  jobUrl: url,
  dateApplied: optionalDate,
  status: z.enum(STATUSES),
  type: z.enum(["Application", "Recruiter outreach"]),
  applicationId: z.string().max(150),
  contactId: z.string(),
  lastContactDate: optionalDate,
  nextFollowUpDate: optionalDate,
  repliedAt: optionalDate,
  assessmentDeadline: optionalDate,
  interviewAt: optionalDate,
  source: z.string().max(150),
  notes: z.string().max(10000),
});
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(150),
  company: z.string().trim().min(1).max(150),
  jobTitle: z.string().max(200),
  email: z.email().toLowerCase(),
  linkedInUrl: url,
  lastContacted: optionalDate,
  notes: z.string().max(10000),
});
export const toDate = (v: string) => (v ? new Date(v) : null);
