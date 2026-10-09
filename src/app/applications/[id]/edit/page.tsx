import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ApplicationForm } from "@/components/application-form";
import { PageHeading } from "@/components/shared";
export const dynamic = "force-dynamic";
export default async function Edit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [application, contacts] = await Promise.all([
    db.application.findUnique({ where: { id }, include: { company: true } }),
    db.contact.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!application) notFound();
  return (
    <>
      <PageHeading
        title="Edit application"
        description="Keep your application details and next steps up to date."
      />
      <ApplicationForm application={application} contacts={contacts} />
    </>
  );
}
