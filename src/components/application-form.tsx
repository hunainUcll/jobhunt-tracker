"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Application, Company, Contact } from "@prisma/client";
import { saveApplication } from "@/app/actions";
import { STATUSES } from "@/lib/domain";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
export function ApplicationForm({
  application,
  contacts,
}: {
  application?: Application & { company: Company };
  contacts: Contact[];
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const date = (v?: Date | null) =>
    v ? new Date(v).toISOString().slice(0, 10) : "";
  async function submit(form: FormData) {
    setPending(true);
    setError("");
    const r = await saveApplication(form, application?.id);
    setPending(false);
    if (r.error) setError(r.error);
    else {
      router.push(`/applications/${r.id}`);
      router.refresh();
    }
  }
  return (
    <Card className="max-w-4xl p-6">
      <form action={submit}>
        <div className="field-grid">
          <div>
            <label htmlFor="company">Company *</label>
            <input
              id="company"
              name="company"
              required
              defaultValue={application?.company.name}
            />
          </div>
          <div>
            <label htmlFor="jobTitle">Job title / opportunity *</label>
            <input
              id="jobTitle"
              name="jobTitle"
              required
              defaultValue={application?.jobTitle}
            />
          </div>
          <div>
            <label htmlFor="type">Tracking type</label>
            <select
              id="type"
              name="type"
              defaultValue={application?.type || "Application"}
            >
              <option>Application</option>
              <option>Recruiter outreach</option>
            </select>
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              defaultValue={application?.status || "Interested"}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="location">Location</label>
            <input
              id="location"
              name="location"
              defaultValue={application?.location}
            />
          </div>
          <div>
            <label htmlFor="jobUrl">Job URL</label>
            <input
              id="jobUrl"
              name="jobUrl"
              type="url"
              defaultValue={application?.jobUrl}
            />
          </div>
          <div>
            <label htmlFor="dateApplied">Applied / first outreach</label>
            <input
              id="dateApplied"
              name="dateApplied"
              type="date"
              defaultValue={date(application?.dateApplied)}
            />
          </div>
          <div>
            <label htmlFor="contactId">Recruiter / contact</label>
            <select
              id="contactId"
              name="contactId"
              defaultValue={application?.contactId || ""}
            >
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="applicationId">Application reference ID</label>
            <input
              id="applicationId"
              name="applicationId"
              defaultValue={application?.applicationId || ""}
            />
          </div>
          <div>
            <label htmlFor="source">Source</label>
            <input
              id="source"
              name="source"
              defaultValue={application?.source || "Manual"}
            />
          </div>
          {(
            [
              "lastContactDate",
              "nextFollowUpDate",
              "repliedAt",
              "assessmentDeadline",
              "interviewAt",
            ] as const
          ).map((key) => (
            <div key={key}>
              <label htmlFor={key}>
                {
                  {
                    lastContactDate: "Last contact",
                    nextFollowUpDate: "Next follow-up override",
                    repliedAt: "Recruiter replied on",
                    assessmentDeadline: "Assessment deadline",
                    interviewAt: "Interview scheduled on",
                  }[key]
                }
              </label>
              <input
                id={key}
                name={key}
                type="date"
                defaultValue={date(application?.[key])}
              />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={application?.notes}
          />
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button disabled={pending}>
            {pending ? "Saving…" : "Save application"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
