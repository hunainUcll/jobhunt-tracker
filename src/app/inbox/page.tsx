import Link from "next/link";
import { db } from "@/lib/db";
import { dateLabel } from "@/lib/utils";
import { PageHeading, Empty } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { InboxReview } from "@/components/inbox-review";
import { markNotificationsRead } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Inbox() {
  const [settings, messages, apps, notifications] = await Promise.all([
    db.userSettings.findUnique({ where: { id: "local" } }),
    db.emailMessage.findMany({
      where: { dismissed: false },
      include: {
        thread: { include: { application: { include: { company: true } } } },
      },
      orderBy: [{ reviewed: "asc" }, { receivedAt: "desc" }],
      take: 200,
    }),
    db.application.findMany({
      include: { company: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.activity.findMany({
      where: {
        read: false,
        kind: {
          in: [
            "INTERVIEW",
            "ASSESSMENT",
            "OFFER",
            "RECRUITER_REPLY",
            "FOLLOW_UP",
            "REJECTION",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return (
    <>
      <PageHeading
        title="Job inbox"
        description="Recruiting messages only. Review uncertain matches before your tracker changes."
      >
        <SyncButton connected={!!settings?.encryptedTokens} />
      </PageHeading>
      {notifications.length > 0 && (
        <Card className="mb-6 border-indigo-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">New responses</h2>
            <form action={markNotificationsRead}>
              <Button variant="ghost" size="sm">
                Mark all read
              </Button>
            </form>
          </div>
          <div className="mt-4 space-y-3">
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={
                  n.applicationId
                    ? `/applications/${n.applicationId}`
                    : "/inbox"
                }
                className="block text-xs text-indigo-500"
              >
                {n.message} →
              </Link>
            ))}
          </div>
        </Card>
      )}
      {!settings?.encryptedTokens && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Connect Gmail in Settings to discover job-related messages.
          </p>
          <Button asChild variant="outline">
            <Link href="/settings">Connect Gmail</Link>
          </Button>
        </Card>
      )}
      <p className="mb-5 text-xs text-muted-foreground">
        Last complete sync: {dateLabel(settings?.lastSyncAt)} · Showing up to
        200 cached messages · Short snippets only
      </p>
      <div className="space-y-4">
        {messages.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600">
                    {m.classification.replaceAll("_", " ")}
                  </span>
                  {!m.reviewed && (
                    <span className="text-[10px] text-amber-600">
                      Needs Review
                    </span>
                  )}
                  {m.gmailMessageId.startsWith("demo-") && (
                    <span className="text-[10px] text-muted-foreground">
                      Fictional example
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-semibold">{m.subject}</h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {m.sender}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {dateLabel(m.receivedAt)}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {m.snippet}
            </p>
            {m.classificationReason && (
              <div className="mt-3 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  {m.classificationSource === "OLLAMA"
                    ? "Local AI suggestion"
                    : "Deterministic classification"}{" "}
                  · {Math.round(m.classificationConfidence * 100)}% confidence
                </p>
                <p className="mt-1">{m.classificationReason}</p>
                {(m.suggestedCompany || m.suggestedRole) && (
                  <p className="mt-1">
                    Suggested company / role:{" "}
                    {[m.suggestedCompany, m.suggestedRole]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {m.aiError && (
                  <p className="mt-2 text-amber-600">{m.aiError}</p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {Math.round(m.matchConfidence * 100)}% match confidence ·{" "}
                {m.matchReason || "Manual review needed"}
              </span>
              {m.thread.application && (
                <Link
                  className="text-indigo-500"
                  href={`/applications/${m.thread.application.id}`}
                >
                  {m.thread.application.company.name} · View application →
                </Link>
              )}
            </div>
            {!m.reviewed && (
              <InboxReview
                id={m.id}
                suggested={m.suggestedApplicationId}
                classification={m.classification}
                applications={apps.map((a) => ({
                  id: a.id,
                  label: `${a.company.name} · ${a.jobTitle}`,
                }))}
              />
            )}
          </Card>
        ))}
      </div>
      {!messages.length && (
        <Card>
          <Empty
            title="Your inbox is ready"
            description="Connect Gmail and sync. Relevant messages will appear here; uncertain matches always need your confirmation."
          />
        </Card>
      )}
    </>
  );
}
