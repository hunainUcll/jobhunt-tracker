import { db } from "@/lib/db";
import { ApplicationForm } from "@/components/application-form";
import { PageHeading } from "@/components/shared";
export const dynamic = "force-dynamic";
export default async function New() {
  const contacts = await db.contact.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeading
        title="Add an application"
        description="Track a formal application or start a recruiter outreach conversation."
      />
      <ApplicationForm contacts={contacts} />
    </>
  );
}
