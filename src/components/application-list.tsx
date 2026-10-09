"use client";
import { useState } from "react";
import Link from "next/link";
import type { Application, Company, Contact } from "@prisma/client";
import { Search, List, Columns3, ArrowRight } from "lucide-react";
import { STATUSES, followUpDate, followUpLabel } from "@/lib/domain";
import { dateLabel } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Empty, StatusBadge } from "./shared";
type Row = Application & { company: Company; contact: Contact | null };
export function ApplicationList({ applications }: { applications: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("table");
  const [dueOnly, setDueOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = applications.filter((a) => {
    const date = a.dateApplied
      ? new Date(a.dateApplied).toISOString().slice(0, 10)
      : "";
    const due = followUpDate({
      ...a,
      dateApplied: a.dateApplied ? new Date(a.dateApplied) : null,
      lastContactDate: a.lastContactDate ? new Date(a.lastContactDate) : null,
      nextFollowUpDate: a.nextFollowUpDate
        ? new Date(a.nextFollowUpDate)
        : null,
    });
    return (
      `${a.company.name} ${a.jobTitle} ${a.contact?.name || ""} ${a.contact?.email || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status || a.status === status) &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      (!dueOnly || (!!due && due <= new Date()))
    );
  });
  return (
    <>
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-52 flex-1">
          <Search
            size={16}
            className="absolute left-3 top-3 text-muted-foreground"
          />
          <input
            aria-label="Search applications"
            placeholder="Search company, role, or contact…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter status"
          className="w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Applied from"
          className="w-auto"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          aria-label="Applied until"
          className="w-auto"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <label className="mb-0 flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => setDueOnly(e.target.checked)}
          />{" "}
          Follow-up due
        </label>
        <div className="flex gap-1 border-l border-border pl-3">
          <Button
            aria-label="Table view"
            variant={view === "table" ? "default" : "ghost"}
            size="icon"
            onClick={() => setView("table")}
          >
            <List size={17} />
          </Button>
          <Button
            aria-label="Kanban view"
            variant={view === "kanban" ? "default" : "ghost"}
            size="icon"
            onClick={() => setView("kanban")}
          >
            <Columns3 size={17} />
          </Button>
        </div>
      </Card>
      <p className="mb-4 text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? "entry" : "entries"} in your pipeline
      </p>
      {rows.length === 0 ? (
        <Card>
          <Empty
            title="No applications found"
            description="Add an application or adjust your filters."
          />
        </Card>
      ) : view === "table" ? (
        <Card className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Company / role</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Date applied</th>
                <th>Next follow-up</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const d = followUpDate({
                  ...a,
                  dateApplied: a.dateApplied ? new Date(a.dateApplied) : null,
                  lastContactDate: a.lastContactDate
                    ? new Date(a.lastContactDate)
                    : null,
                  nextFollowUpDate: a.nextFollowUpDate
                    ? new Date(a.nextFollowUpDate)
                    : null,
                });
                return (
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
                          <p className="font-semibold">{a.company.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {a.jobTitle}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {a.location}
                            {a.type === "Recruiter outreach"
                              ? " · Outreach"
                              : ""}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-xs">
                      {a.contact?.name || "—"}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {a.contact?.email}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {dateLabel(a.dateApplied)}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {d ? followUpLabel(d) : "—"}
                    </td>
                    <td>
                      <Link
                        href={`/applications/${a.id}`}
                        aria-label={`Open ${a.company.name}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-5">
          {STATUSES.map((s) => (
            <div key={s} className="w-64 shrink-0 rounded-xl bg-muted p-3">
              <div className="mb-4 flex items-center justify-between">
                <StatusBadge status={s} />
                <span className="text-xs text-muted-foreground">
                  {rows.filter((a) => a.status === s).length}
                </span>
              </div>
              <div className="space-y-3">
                {rows
                  .filter((a) => a.status === s)
                  .map((a) => (
                    <Link
                      href={`/applications/${a.id}`}
                      key={a.id}
                      className="block rounded-xl border border-border bg-card p-4 shadow-sm hover:border-indigo-300"
                    >
                      <div className="mb-3 company-avatar">
                        {a.company.name[0]}
                      </div>
                      <p className="text-sm font-semibold">{a.company.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {a.jobTitle}
                      </p>
                      <div className="mt-4 border-t border-border pt-3 text-[10px] text-muted-foreground">
                        {a.contact?.name || a.location} ·{" "}
                        {dateLabel(a.dateApplied)}
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
