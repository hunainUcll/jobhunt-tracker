"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Company } from "@prisma/client";
import { saveContact } from "@/app/actions";
import { Button } from "./ui/button";
export function ContactForm({
  contact,
}: {
  contact?: Contact & { company: Company };
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(form: FormData) {
    setPending(true);
    const r = await saveContact(form, contact?.id);
    setPending(false);
    if (r.error) setError(r.error);
    else {
      router.push("/contacts");
      router.refresh();
    }
  }
  return (
    <form
      action={submit}
      className="max-w-3xl rounded-xl border border-border bg-card p-6"
    >
      <div className="field-grid">
        {[
          {
            key: "name",
            label: "Name",
            type: "text",
            value: contact?.name,
            required: true,
          },
          {
            key: "company",
            label: "Company",
            type: "text",
            value: contact?.company.name,
            required: true,
          },
          {
            key: "jobTitle",
            label: "Job title",
            type: "text",
            value: contact?.jobTitle,
          },
          {
            key: "email",
            label: "Email",
            type: "email",
            value: contact?.email,
            required: true,
          },
          {
            key: "linkedInUrl",
            label: "LinkedIn URL",
            type: "url",
            value: contact?.linkedInUrl,
          },
          {
            key: "lastContacted",
            label: "Last contacted",
            type: "date",
            value: contact?.lastContacted
              ? new Date(contact.lastContacted).toISOString().slice(0, 10)
              : "",
          },
        ].map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key}>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            <input
              id={f.key}
              name={f.key}
              type={f.type}
              defaultValue={f.value}
              required={f.required}
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={contact?.notes}
        />
      </div>
      {error && (
        <p className="my-3 text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button disabled={pending}>
          {pending ? "Saving…" : "Save contact"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
