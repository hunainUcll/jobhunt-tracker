"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FilePenLine, Check } from "lucide-react";
import { recordContact } from "@/app/actions";
import { Button } from "./ui/button";
export function FollowUpComposer({
  applicationId,
  defaultText,
  recipient,
  subject,
  gmailConnected,
  draftsEnabled,
}: {
  applicationId: string;
  defaultText: string;
  recipient: string;
  subject: string;
  gmailConnected: boolean;
  draftsEnabled: boolean;
}) {
  const [text, setText] = useState(defaultText);
  const [to, setTo] = useState(recipient);
  const [title, setTitle] = useState(subject);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [draftId, setDraftId] = useState("");
  const router = useRouter();
  async function draft() {
    setPending(true);
    setMessage("");
    try {
      const r = await fetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, to, subject: title, text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Draft creation failed");
      setDraftId(data.messageId);
      setMessage("Draft created. Open Gmail to review and send it yourself.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create draft");
    } finally {
      setPending(false);
    }
  }
  async function sent() {
    setPending(true);
    try {
      const r = await recordContact(applicationId);
      setMessage(r.error || r.success || "Saved");
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-5 space-y-3">
      <div>
        <label htmlFor={`to-${applicationId}`}>To</label>
        <input
          id={`to-${applicationId}`}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recruiter@company.com"
        />
      </div>
      <div>
        <label htmlFor={`subject-${applicationId}`}>Subject</label>
        <input
          id={`subject-${applicationId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`text-${applicationId}`}>
          Suggested email · edit before using
        </label>
        <textarea
          id={`text-${applicationId}`}
          className="text-xs leading-relaxed"
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMessage("Copied to clipboard");
            } catch {
              setMessage("Copy the text manually from the editor");
            }
          }}
        >
          <Copy size={13} />
          Copy
        </Button>
        <Button
          size="sm"
          disabled={
            pending || !gmailConnected || !draftsEnabled || !to || !text.trim()
          }
          onClick={draft}
        >
          <FilePenLine size={13} />
          {pending ? "Working…" : "Create Gmail draft"}
        </Button>
      </div>
      {!draftsEnabled && (
        <p className="text-[10px] text-muted-foreground">
          Enable optional draft permission in Settings to create drafts.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Drafts never send emails or mark a follow-up as sent.
      </p>
      {draftId && (
        <a
          className="block text-xs text-indigo-500"
          href={`https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(draftId)}`}
          target="_blank"
          rel="noreferrer"
        >
          Review draft in Gmail ↗
        </a>
      )}
      <Button variant="ghost" size="sm" disabled={pending} onClick={sent}>
        <Check size={13} />I sent a follow-up myself
      </Button>
      <p role="status" className="text-xs">
        {message}
      </p>
    </div>
  );
}
