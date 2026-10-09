import { ContactForm } from "@/components/contact-form";
import { PageHeading } from "@/components/shared";
export default function New() {
  return (
    <>
      <PageHeading
        title="Add a contact"
        description="Save a recruiter or professional contact for future opportunities."
      />
      <ContactForm />
    </>
  );
}
