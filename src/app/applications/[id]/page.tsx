import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ExternalLink, Mail } from "lucide-react";
import { db } from "@/lib/db";
import { followUpDate, followUpLabel, suggestedReply } from "@/lib/domain";
import { dateLabel } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeading, StatusBadge, Empty } from "@/components/shared";
import { FollowUpComposer } from "@/components/follow-up-composer";
export const dynamic = "force-dynamic";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [a, settings] = await Promise.all([
    db.application.findUnique({
      where: { id },
      include: {
        company: true,
        contact: true,
        threads: {
          include: {
            messages: {
              where: { dismissed: false, reviewed: true },
              orderBy: { receivedAt: "asc" },
            },
          },
        },
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    }),
    db.userSettings.findUnique({ where: { id: "local" } }),
  ]);
  if (!a) notFound();
  const due = followUpDate(a);
  const messages = a.threads
    .flatMap((t) => t.messages)
    .sort((x, y) => x.receivedAt.getTime() - y.receivedAt.getTime());
  return (
    <>
      <PageHeading title={a.company.name} description={a.jobTitle}>
        <Button asChild variant="outline">
          <Link href={`/applications/${id}/edit`}>
            <Pencil size={14} /> Edit application
          </Link>
        </Button>
      </PageHeading>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={a.status} />
        <span className="text-xs text-muted-foreground">
          {a.type} · {a.location}
        </span>
        {a.jobUrl && (
          <a
            href={a.jobUrl}
            rel="noreferrer"
            target="_blank"
            className="flex gap-1 text-xs text-indigo-500"
          >
            Job posting <ExternalLink size={12} />
          </a>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="panel-title mb-5">Application details</h2>
            <dl className="grid grid-cols-2 gap-5">
              {[
                ["Date applied", dateLabel(a.dateApplied)],
                ["Source", a.source],
                ["Contact", a.contact?.name || "—"],
                ["Recruiter email", a.contact?.email || "—"],
                ["Last contact", dateLabel(a.lastContactDate)],
                [
                  "Next follow-up",
                  due ? dateLabel(due) : "No follow-up scheduled",
                ],
                ["Application ID", a.applicationId || "—"],
                ["Recruiter replied", dateLabel(a.repliedAt)],
                ["Assessment deadline", dateLabel(a.assessmentDeadline)],
                ["Interview date", dateLabel(a.interviewAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 break-words text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            {a.notes && (
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="text-xs font-semibold">Notes</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {a.notes}
                </p>
              </div>
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2 border-b border-border p-5">
              <Mail size={17} className="text-indigo-500" />
              <h2 className="panel-title">Relevant email thread</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {messages.length} messages
              </span>
            </div>
            {!messages.length ? (
              <Empty
                title="No linked messages yet"
                description="Sync Gmail and confirm relevant matches in the inbox. Only job-related messages appear here."
              />
            ) : (
              <div className="divide-y divide-border">
                {messages.map((m) => (
                  <div className="p-5" key={m.id}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-xs font-semibold">{m.sender}</p>
                      <span className="text-xs text-muted-foreground">
                        {dateLabel(m.receivedAt)}
                      </span>
                    </div>
                    <p className="mt-3 font-medium">{m.subject}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {m.snippet}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] text-indigo-500">
                        {m.classification.replaceAll("_", " ")}
                      </span>
                      {!m.gmailMessageId.startsWith("demo-") && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(a.threads.find((t) => t.id === m.threadId)!.gmailThreadId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-500"
                        >
                          Open in Gmail ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="panel-title">Next step</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {due
                ? followUpLabel(due)
                : "No follow-up needed for the current status."}
            </p>
            {due && (
              <FollowUpComposer
                applicationId={id}
                defaultText={suggestedReply(a, settings?.name || "Alex")}
                recipient={a.contact?.email || ""}
                subject={`Follow-up: ${a.jobTitle} at ${a.company.name}`}
                gmailConnected={!!settings?.encryptedTokens}
                draftsEnabled={
                  !!settings?.gmailScopes.includes("gmail.compose")
                }
              />
            )}
          </Card>
          <Card className="p-6">
            <h2 className="panel-title mb-5">Activity</h2>
            <div className="space-y-5">
              {a.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="border-l-2 border-indigo-200 pl-3"
                >
                  <p className="text-xs">{activity.message}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {dateLabel(activity.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
