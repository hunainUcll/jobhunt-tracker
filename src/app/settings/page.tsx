import { db } from "@/lib/db";
import { PageHeading } from "@/components/shared";
import { SettingsPanel } from "@/components/settings-panel";
import { configFromSettings } from "@/lib/ai-config";
export const dynamic = "force-dynamic";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const [settings, params] = await Promise.all([
    db.userSettings.findUnique({ where: { id: "local" } }),
    searchParams,
  ]);
  const configured =
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    /^[0-9a-f]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY || "");
  return (
    <>
      <PageHeading
        title="Settings"
        description="Make this workspace yours. Choose what you connect and keep."
      />
      {params.error && (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700"
        >
          {params.error}
        </p>
      )}
      {params.connected && (
        <p className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
          Gmail connected. Visit the inbox to sync recruiting messages.
        </p>
      )}
      <SettingsPanel
        name={settings?.name || "Alex"}
        email={settings?.gmailEmail || null}
        draftsEnabled={!!settings?.gmailScopes.includes("gmail.compose")}
        configured={configured}
        aiConfig={configFromSettings(settings)}
      />
    </>
  );
}
