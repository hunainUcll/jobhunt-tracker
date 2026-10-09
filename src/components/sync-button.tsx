"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
export function SyncButton({ connected }: { connected: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [more, setMore] = useState(false);
  const router = useRouter();
  async function sync() {
    setPending(true);
    setMessage("");
    try {
      const r = await fetch("/api/gmail/sync", { method: "POST" });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMore(result.hasMore);
      setMessage(
        `${result.imported} new messages · ${result.review} need review${result.hasMore ? " · More results available" : ""}${result.aiWarning ? ` · ${result.aiWarning}` : ""}`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="max-w-sm text-right">
      <Button disabled={pending || !connected} onClick={sync}>
        <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
        {pending ? "Syncing…" : more ? "Sync next page" : "Sync Gmail"}
      </Button>
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
