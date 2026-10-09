import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeading, Empty } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Contacts() {
  const contacts = await db.contact.findMany({
    include: { company: true, applications: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeading
        title="Contacts"
        description="Build relationships that open doors. Keep every conversation connected."
      >
        <Button asChild>
          <Link href="/contacts/new">
            <Plus size={16} />
            Add contact
          </Link>
        </Button>
      </PageHeading>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {contacts.map((c) => (
          <Card key={c.id} className="p-6">
            <div className="flex gap-3">
              <div className="company-avatar">
                {c.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <Link
                  href={`/contacts/${c.id}/edit`}
                  className="font-semibold hover:text-indigo-500"
                >
                  {c.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.jobTitle} · {c.company.name}
                </p>
              </div>
            </div>
            <p className="mt-5 break-all text-xs text-muted-foreground">
              {c.email}
            </p>
            {c.linkedInUrl && (
              <a
                href={c.linkedInUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-xs text-indigo-500"
              >
                LinkedIn profile ↗
              </a>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Last contacted</span>
                <span>{dateLabel(c.lastContacted)}</span>
              </div>
              <div className="mt-4 space-y-2">
                {c.applications.map((a) => (
                  <Link
                    href={`/applications/${a.id}`}
                    key={a.id}
                    className="block rounded-md bg-muted px-3 py-2 text-xs"
                  >
                    {a.jobTitle} →
                  </Link>
                ))}
              </div>
              {c.notes && (
                <p className="mt-4 whitespace-pre-wrap text-xs text-muted-foreground">
                  {c.notes}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
      {!contacts.length && (
        <Card>
          <Empty
            title="Your network starts here"
            description="Add a recruiter and link them to one or more applications."
          />
        </Card>
      )}
    </>
  );
}
