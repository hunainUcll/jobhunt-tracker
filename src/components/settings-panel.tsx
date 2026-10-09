"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck, Unplug } from "lucide-react";
import { updateSettings, disconnectGmail } from "@/app/settings/actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { LocalAiSettings } from "./local-ai-settings";
import type { LocalAiConfig } from "@/lib/ai-config";
export function SettingsPanel({
  name,
  email,
  draftsEnabled,
  configured,
  aiConfig,
}: {
  name: string;
  email: string | null;
  draftsEnabled: boolean;
  configured: boolean;
  aiConfig: LocalAiConfig;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  return (
    <div className="max-w-4xl space-y-6">
      <LocalAiSettings config={aiConfig} />
      <Card className="p-6">
        <h2 className="panel-title mb-5">Your profile</h2>
        <form
          action={async (form) => {
            setPending(true);
            const r = await updateSettings(form);
            setMessage(r.error || r.success || "");
            setPending(false);
            router.refresh();
          }}
        >
          <label htmlFor="name">Name for suggested email signatures</label>
          <input
            id="name"
            name="name"
            className="max-w-md"
            defaultValue={name}
            required
          />
          <Button className="ml-3" disabled={pending}>
            Save
          </Button>
        </form>
      </Card>
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Mail size={19} className="text-indigo-500" />
          <h2 className="panel-title">Gmail connection</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {email
            ? `Connected to ${email}`
            : "No account connected. Your local tracker works without Gmail."}
        </p>
        {!configured && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            Google OAuth is not configured yet. Follow the README to add
            GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY to
            .env, then restart the app.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {configured ? (
            <Button asChild>
              <a href="/api/google/connect">
                {email ? "Reconnect Gmail" : "Connect Gmail · read-only"}
              </a>
            </Button>
          ) : (
            <Button disabled>Connect Gmail · read-only</Button>
          )}
          {email && !draftsEnabled && (
            <Button variant="outline" asChild>
              <a href="/api/google/connect?drafts=1">
                Enable optional Gmail drafts
              </a>
            </Button>
          )}
          {email && (
            <Button variant="outline" onClick={() => setConfirm(true)}>
              <Unplug size={15} />
              Disconnect & delete cached mail
            </Button>
          )}
        </div>
        {draftsEnabled && (
          <p className="mt-4 text-xs text-emerald-600">
            Optional draft permission is enabled. Drafts require an explicit
            button click.
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Initial access uses gmail.readonly. Google&apos;s gmail.compose
          permission allows both drafts and sending; it is the narrowest scope
          available for standalone Gmail draft creation. JobHunt uses it solely
          to create drafts and contains no send endpoint. Sending happens only
          in Gmail.
        </p>
        {confirm && (
          <div
            role="alertdialog"
            aria-labelledby="disconnect-title"
            className="mt-5 rounded-lg border border-red-200 p-4"
          >
            <h3 id="disconnect-title" className="text-sm font-semibold">
              Disconnect Gmail and delete all cached email metadata?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Applications and contacts stay. Existing Gmail drafts remain in
              Gmail.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  const r = await disconnectGmail();
                  setMessage(r.error || r.success || "");
                  setConfirm(false);
                  setPending(false);
                  router.refresh();
                }}
              >
                {pending ? "Disconnecting…" : "Disconnect & delete"}
              </Button>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={19} className="text-indigo-500" />
          <h2 className="panel-title">Privacy by default</h2>
        </div>
        <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
          <li>
            SQLite stays on this computer. OAuth tokens are encrypted with
            AES-256-GCM.
          </li>
          <li>
            No Google passwords. Optional AI runs on local Ollama only. No
            automatic email sending.
          </li>
          <li>
            Only relevant messages are cached: sender, recipient, subject, date,
            classification, and a short snippet.
          </li>
          <li>
            Sync searches likely recruiting emails from the last 90 days
            initially, with incremental overlap after that.
          </li>
          <li>
            Uncertain matches require your confirmation before updating an
            application.
          </li>
          <li>
            This is a single-user localhost app. Start commands bind to
            127.0.0.1.
          </li>
        </ul>
        <Link
          href="/applications"
          className="mt-5 block text-xs text-indigo-500"
        >
          Export your applications as CSV →
        </Link>
      </Card>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
