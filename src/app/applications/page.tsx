import { db } from "@/lib/db";
import { ApplicationList } from "@/components/application-list";
import { PageHeading, NewApplication } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CsvImport } from "@/components/csv-import";
import { Download } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Applications() {
  const applications = await db.application.findMany({
    include: { company: true, contact: true },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeading
        title="Applications"
        description="All your opportunities, from first interest to your next offer."
      >
        <CsvImport />
        <Button variant="outline" asChild>
          <a href="/api/csv">
            <Download size={15} />
            Export
          </a>
        </Button>
        <NewApplication />
      </PageHeading>
      <ApplicationList applications={applications} />
    </>
  );
}
