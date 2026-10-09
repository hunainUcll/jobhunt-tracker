"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, PlugZap } from "lucide-react";
import { updateLocalAiSettings } from "@/app/settings/actions";
import type { LocalAiConfig } from "@/lib/ai-config";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
export function LocalAiSettings({ config }: { config: LocalAiConfig }) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [url, setUrl] = useState(config.url);
  const [model, setModel] = useState(config.model);
  const [threshold, setThreshold] = useState(
    String(config.confidenceThreshold),
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const router = useRouter();
  async function save(form: FormData) {
    setSaving(true);
    try {
      const result = await updateLocalAiSettings(form);
      setMessage(result.error || result.success || "");
      router.refresh();
    } catch {
      setMessage("Could not save local AI settings. Try again.");
    } finally {
      setSaving(false);
    }
  }
  async function test() {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/ollama/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          url,
          model,
          confidenceThreshold: Number(threshold),
        }),
      });
      const result = await response.json();
      setMessage(result.error || result.success);
    } catch {
      setMessage(
        "Connection test failed. Deterministic rules remain available.",
      );
    } finally {
      setTesting(false);
    }
  }
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Cpu size={19} className="text-indigo-500" />
        <h2 className="panel-title">Local AI email classification</h2>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Ollama can help with unclear recruiting emails after deterministic
        rules. Only the current sender, subject, and cleaned body are processed
        locally. AI results suggest updates for your approval.
      </p>
      <form action={save}>
        <label
          className="mb-5 flex items-center gap-3"
          htmlFor="local-ai-enabled"
        >
          <input
            id="local-ai-enabled"
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable local AI
        </label>
        <div className="field-grid">
          <div>
            <label htmlFor="ollama-url">Ollama URL</label>
            <input
              id="ollama-url"
              type="url"
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              HTTP localhost / 127.0.0.1 / ::1 only. Remote URLs and redirects
              are blocked.
            </p>
          </div>
          <div>
            <label htmlFor="ollama-model">Model name</label>
            <input
              id="ollama-model"
              name="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              Default: qwen2.5:3b. The model must be installed locally.
            </p>
          </div>
          <div>
            <label htmlFor="ai-threshold">Confidence threshold</label>
            <input
              id="ai-threshold"
              type="number"
              min="0.70"
              max="1"
              step="0.01"
              name="confidenceThreshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              0.70–1.00. Results below this value are marked Needs Review.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled={saving || testing}>
            {saving ? "Saving…" : "Save AI settings"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving || testing}
            onClick={test}
          >
            <PlugZap size={15} />
            {testing ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The test checks the local server and installed model without sending
        email content. If Ollama is stopped or returns invalid JSON, sync
        continues with deterministic rules and unclear emails stay in review. No
        cloud provider or email sending is used.
      </p>
      <p role="status" aria-live="polite" className="mt-4 text-xs">
        {message}
      </p>
    </Card>
  );
}
