import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ContactForm } from "@/components/contact-form";
import { PageHeading } from "@/components/shared";
export const dynamic = "force-dynamic";
export default async function Edit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: { company: true },
  });
  if (!contact) notFound();
  return (
    <>
      <PageHeading
        title="Edit contact"
        description="Update details for your professional network."
      />
      <ContactForm contact={contact} />
    </>
  );
}
