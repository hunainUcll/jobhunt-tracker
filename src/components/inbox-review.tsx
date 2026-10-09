"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { confirmMatch, dismissMessage } from "@/app/inbox/actions";
import { Button } from "./ui/button";
import { CLASSIFICATIONS } from "@/lib/ai-config";
export function InboxReview({
  id,
  suggested,
  applications,
  classification,
}: {
  id: string;
  suggested: string | null;
  applications: { id: string; label: string }[];
  classification: string;
}) {
  const [selected, setSelected] = useState(suggested || "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(classification);
  const router = useRouter();
  async function confirm() {
    setPending(true);
    try {
      const result = await confirmMatch(id, selected, status);
      setMessage(result.error || result.success || "");
      router.refresh();
    } catch {
      setMessage("Could not confirm match. Try again.");
    } finally {
      setPending(false);
    }
  }
  async function dismiss() {
    setPending(true);
    try {
      await dismissMessage(id);
      router.refresh();
    } catch {
      setMessage("Could not dismiss message. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-4 rounded-lg bg-muted p-4">
      <p className="mb-3 text-xs font-medium">
        Review the classification and application before accepting this update
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Select application for message"
          className="min-w-48 flex-1"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select an application</option>
          {applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Review email classification"
          className="w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {CLASSIFICATIONS.map((s) => (
            <option value={s} key={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-10"
          disabled={!selected || pending}
          onClick={confirm}
        >
          Confirm match & status
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-10"
          disabled={pending}
          onClick={dismiss}
        >
          Not relevant
        </Button>
      </div>
      <Link
        href="/applications/new"
        className="mt-3 block text-xs text-indigo-500"
      >
        Missing an application? Add it first, then confirm this match →
      </Link>
      <p role="status" className="mt-2 text-xs">
        {message}
      </p>
    </div>
  );
}
