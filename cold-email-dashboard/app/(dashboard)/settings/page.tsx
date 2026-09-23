import { resetSettingsAction, setDataModeAction } from "@/app/actions";
import { SettingsForm } from "@/components/SettingsForm";
import { getMainDb } from "@/lib/db";
import { lastSyncRun } from "@/lib/repository";
import { MOCK_HISTORY_DAYS } from "@/lib/mock/generate";
import { getDataMode, getSettings } from "@/lib/settings";

const has = (k: string) => Boolean(process.env[k]);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const db = await getMainDb();
  const [settings, mode, last] = await Promise.all([getSettings(db), getDataMode(db), lastSyncRun(db)]);
  const checks = [
    { ok: has("SMARTLEAD_API_KEY"), label: "SMARTLEAD_API_KEY set (needed for live data)" },
    { ok: has("CRON_SECRET"), label: "CRON_SECRET set (daily snapshot job)" },
    { ok: has("WEBHOOK_SECRET"), label: "WEBHOOK_SECRET set (Smartlead webhook)" },
    { ok: last?.status === "ok", label: last ? `Last sync: ${last.status} at ${last.started_at.slice(0, 16).replace("T", " ")} UTC${last.message ? `, ${last.message}` : ""}` : "No sync has run yet" },
  ];

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="range">Costs and definitions used by every view.</div>
        </div>
      </div>

      <section className="card">
        <h2>Data source</h2>
        <p className="help">
          Sample data lets you see the dashboard before campaigns go live. Live data comes from the daily Smartlead sync.
          In sample mode, costs start {MOCK_HISTORY_DAYS} days ago so the numbers are meaningful; your cost start date below isn’t changed.
        </p>
        <form action={setDataModeAction} className="actions" style={{ marginTop: 0 }}>
          <span>
            Currently showing: <strong>{mode === "mock" ? "Sample data" : "Live Smartlead data"}</strong>
          </span>
          <input type="hidden" name="mode" value={mode === "mock" ? "live" : "mock"} />
          <button type="submit">{mode === "mock" ? "Switch to live data" : "Switch to sample data"}</button>
        </form>
        <ul className="checklist" style={{ marginTop: 14 }}>
          {checks.map((c) => (
            <li key={c.label}>
              {c.ok ? "✓" : "✗"} {c.label}
            </li>
          ))}
        </ul>
      </section>

      <SettingsForm key={reset ?? "form"} settings={settings} />

      <form action={resetSettingsAction} className="actions">
        <button type="submit" className="link">
          Reset costs and definitions to the defaults in config/defaults.ts
        </button>
      </form>
    </main>
  );
}
