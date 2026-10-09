"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <h1 className="text-xl font-bold">Something needs attention</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Check the terminal for details. If this is your first run, initialize
        the database using the README commands.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
