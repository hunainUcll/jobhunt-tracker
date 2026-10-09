"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "./ui/button";
export function CsvImport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function upload(form: FormData) {
    setPending(true);
    try {
      const r = await fetch("/api/csv", { method: "POST", body: form });
      const body = await r.json();
      setMessage(
        body.error ||
          `Imported ${body.imported}; skipped ${body.skipped} duplicates.${body.errors?.length ? ` Issues: ${body.errors.join("; ")}` : ""}`,
      );
      router.refresh();
    } catch {
      setMessage("Import failed. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload size={15} />
        Import
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            className="w-full max-w-lg rounded-xl bg-card p-6"
          >
            <h2 id="import-title" className="panel-title">
              Import applications
            </h2>
            <p className="my-4 text-xs leading-relaxed text-muted-foreground">
              CSV must include company and jobTitle. Export first for a complete
              template. Maximum 500 rows; duplicates are skipped. Contacts are
              linked by existing recruiter email.
            </p>
            <form action={upload}>
              <input name="file" type="file" accept=".csv,text/csv" required />
              <p className="my-4 text-xs" role="status">
                {message}
              </p>
              <div className="flex gap-2">
                <Button disabled={pending}>
                  {pending ? "Importing…" : "Import CSV"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
