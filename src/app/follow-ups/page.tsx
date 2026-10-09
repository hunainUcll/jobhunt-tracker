import Link from "next/link";
import { followUpLabel } from "@/lib/domain";
import { db } from "@/lib/db";
import { refreshFollowUps } from "@/lib/follow-ups";
import { dateLabel } from "@/lib/utils";
import { PageHeading, Empty, StatusBadge } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { FollowUpComposer } from "@/components/follow-up-composer";
export const dynamic = "force-dynamic";
export default async function FollowUps() {
  const [followUps, settings] = await Promise.all([
    refreshFollowUps(),
    db.userSettings.findUnique({ where: { id: "local" } }),
  ]);
  const due = followUps.filter((f) => f.dueAt <= new Date()).length;
  return (
    <>
      <PageHeading
        title="Follow-ups"
        description={`${due} due · Applications: 7 days. Recruiter outreach: 5 business days. You decide when to reach out.`}
      />
      <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-relaxed text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
        A suggested email is a starting point. Review it, edit it, and send it
        yourself. Creating a Gmail draft never marks a follow-up as sent.
      </div>
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {followUps.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex items-center gap-3">
              <div className="company-avatar">
                {f.application.company.name[0]}
              </div>
              <div>
                <Link
                  href={`/applications/${f.applicationId}`}
                  className="font-semibold hover:text-indigo-500"
                >
                  {f.application.company.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {f.application.jobTitle}
                </p>
              </div>
            </div>
            <div className="my-4">
              <StatusBadge status={f.application.status} />
              <p
                className={`mt-3 text-xs font-medium ${f.dueAt <= new Date() ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {followUpLabel(f.dueAt)}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Due {dateLabel(f.dueAt)} · {f.application.type}
              </p>
            </div>
            <FollowUpComposer
              applicationId={f.applicationId}
              defaultText={f.suggestedText}
              recipient={f.application.contact?.email || ""}
              subject={`Follow-up: ${f.application.jobTitle} at ${f.application.company.name}`}
              gmailConnected={!!settings?.encryptedTokens}
              draftsEnabled={!!settings?.gmailScopes.includes("gmail.compose")}
            />
          </Card>
        ))}
      </div>
      {!followUps.length && (
        <Card>
          <Empty
            title="Nothing to follow up on"
            description="Follow-ups appear for unanswered applications and recruiter outreach. Replies and progressed applications stop reminders."
          />
        </Card>
      )}
    </>
  );
}
