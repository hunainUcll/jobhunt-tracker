import Link from "next/link";
import {
  BriefcaseBusiness,
  Clock3,
  MessageSquare,
  CalendarDays,
  ClipboardList,
  Trophy,
  XCircle,
  Users,
  ArrowRight,
  Sparkles,
  Bell,
  CheckCircle2,
} from "lucide-react";
import { db } from "@/lib/db";
import { followUpDate, followUpLabel } from "@/lib/domain";
import { dateLabel } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageHeading,
  NewApplication,
  StatusBadge,
  ViewLink,
  Empty,
} from "@/components/shared";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const [apps, activities, settings, unread] = await Promise.all([
    db.application.findMany({
      include: { company: true, contact: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.activity.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { application: { include: { company: true } } },
    }),
    db.userSettings.findUnique({ where: { id: "local" } }),
    db.activity.count({
      where: {
        read: false,
        kind: { in: ["INTERVIEW", "ASSESSMENT", "OFFER", "RECRUITER_REPLY"] },
      },
    }),
  ]);
  const now = new Date();
  const due = apps.filter((a) => {
    const d = followUpDate(a);
    return d && d <= now;
  });
  const metrics = [
    [
      "Total applications",
      apps.filter((a) => a.type === "Application").length,
      BriefcaseBusiness,
      "indigo",
    ],
    [
      "Awaiting reply",
      apps.filter((a) => ["Applied", "Awaiting reply"].includes(a.status))
        .length,
      Clock3,
      "blue",
    ],
    ["Follow-up due", due.length, MessageSquare, "orange"],
    [
      "Interviews",
      apps.filter((a) => a.status === "Interview").length,
      CalendarDays,
      "green",
    ],
    [
      "Assessments",
      apps.filter((a) => a.status === "Assessment").length,
      ClipboardList,
      "orange",
    ],
    [
      "Offers",
      apps.filter((a) => a.status === "Offer").length,
      Trophy,
      "green",
    ],
    [
      "Rejections",
      apps.filter((a) => a.status === "Rejected").length,
      XCircle,
      "rose",
    ],
    [
      "Recruiters contacted",
      new Set(
        apps
          .filter((a) => a.lastContactDate && a.contactId)
          .map((a) => a.contactId),
      ).size,
      Users,
      "purple",
    ],
  ] as const;
  const attention = [
    ...apps
      .filter(
        (a) =>
          a.repliedAt && ["Recruiter contacted", "Offer"].includes(a.status),
      )
      .map((a) => ({
        id: a.id,
        title: `${a.status === "Offer" ? "Offer from" : "Recruiter replied at"} ${a.company.name}`,
        detail: a.jobTitle,
        kind: "reply",
      })),
    ...due.map((a) => ({
      id: a.id,
      title: `Follow up with ${a.company.name}`,
      detail: followUpLabel(followUpDate(a)!),
      kind: "follow-up",
    })),
    ...apps
      .filter((a) => a.status === "Interview")
      .map((a) => ({
        id: a.id,
        title: `Interview at ${a.company.name}`,
        detail: a.jobTitle,
        kind: "interview",
      })),
    ...apps
      .filter((a) => a.assessmentDeadline && a.status === "Assessment")
      .map((a) => ({
        id: a.id,
        title: `Assessment for ${a.company.name}`,
        detail: `Deadline ${dateLabel(a.assessmentDeadline)}`,
        kind: "assessment",
      })),
  ].slice(0, 5);
  return (
    <>
      <PageHeading
        title={`Let's keep things moving, ${settings?.name || "Alex"}.`}
        description="Every application is a step closer. Here's where your search stands."
      >
        <NewApplication />
      </PageHeading>
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(([label, count, Icon, color]) => (
          <Card key={label} className="p-5">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon
                size={17}
                className={
                  color === "orange"
                    ? "text-amber-500"
                    : color === "green"
                      ? "text-emerald-500"
                      : "text-indigo-400"
                }
              />
            </div>
            <div className="mt-3 text-[29px] font-bold tracking-tight">
              {count}
              <span className="ml-3 text-[10px] font-normal text-muted-foreground">
                {label === "Total applications" ? "in your pipeline" : ""}
              </span>
            </div>
          </Card>
        ))}
      </div>
      <div className="mb-7 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              <h2 className="panel-title">Needs attention</h2>
              <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                {attention.length}
              </span>
            </div>
            <ViewLink href="/follow-ups" label="Your next steps" />
          </div>
          {attention.length === 0 ? (
            <Empty
              title="You're all caught up"
              description="Upcoming follow-ups and important responses will appear here."
            />
          ) : (
            <div className="divide-y divide-border">
              {attention.map((a, i) => (
                <Link
                  href={`/applications/${a.id}`}
                  key={`${a.id}-${i}`}
                  className="flex items-center gap-4 p-5 hover:bg-muted"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.kind === "follow-up" ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-500"}`}
                  >
                    {a.kind === "follow-up" ? (
                      <Clock3 size={18} />
                    ) : (
                      <CalendarDays size={18} />
                    )}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{a.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.detail}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="ml-auto text-muted-foreground"
                  />
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card className="flex flex-col p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
              <Bell size={17} />
            </span>
            <h2 className="panel-title">Your job inbox</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {settings?.gmailEmail
              ? `Connected to ${settings.gmailEmail}. Sync to discover new recruiting messages.`
              : "Connect Gmail to bring applications, recruiter replies, and interview invitations into one place."}
          </p>
          <div className="my-5 space-y-3 text-xs text-muted-foreground">
            <p className="flex gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" /> Only
              relevant recruiting messages cached
            </p>
            <p className="flex gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" /> Emails are
              never sent automatically
            </p>
            <p className="flex gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" /> You
              confirm uncertain matches
            </p>
          </div>
          <Button asChild variant="outline" className="mt-auto">
            <Link href={settings?.gmailEmail ? "/inbox" : "/settings"}>
              {settings?.gmailEmail
                ? `Open inbox${unread ? ` · ${unread} new` : ""}`
                : "Connect Gmail"}
              <ArrowRight size={15} />
            </Link>
          </Button>
        </Card>
      </div>
      <Card className="mb-7 overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <h2 className="panel-title">Application pipeline</h2>
          <ViewLink href="/applications" />
        </div>
        {apps.length === 0 ? (
          <Empty
            title="Start your search"
            description="Add an application or import a CSV to build your pipeline."
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Company / role</th>
                  <th>Status</th>
                  <th>Applied</th>
                  <th>Next step</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {apps.slice(0, 5).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/applications/${a.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="company-avatar">
                          {a.company.name[0]}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold">
                            {a.company.name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {a.jobTitle}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {dateLabel(a.dateApplied)}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {followUpDate(a)
                        ? followUpLabel(followUpDate(a)!)
                        : a.status === "Interview"
                          ? "Prepare for interview"
                          : a.status === "Assessment"
                            ? "Complete assessment"
                            : "Stay on track"}
                    </td>
                    <td>
                      <Link
                        aria-label={`Open ${a.company.name}`}
                        href={`/applications/${a.id}`}
                      >
                        <ArrowRight
                          size={16}
                          className="text-muted-foreground"
                        />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between p-5">
          <h2 className="panel-title">Recent activity</h2>
          <span className="eyebrow">Your search, in motion</span>
        </div>
        <div className="grid divide-y divide-border md:grid-cols-3 md:divide-y-0">
          {activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-5 pb-5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
              <div>
                <p className="text-xs font-medium">{a.message}</p>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {dateLabel(a.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
        {!activities.length && (
          <Empty
            title="A fresh start"
            description="Activity will appear as you add applications and sync emails."
          />
        )}
      </Card>
      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        Small steps, big possibilities. You&apos;ve got this.
      </p>
    </>
  );
}
