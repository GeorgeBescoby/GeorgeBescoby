import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { RefreshButton } from "@/components/RefreshButton";
import { getMainDb } from "@/lib/db";
import { lastSyncRun } from "@/lib/repository";
import { getDataMode } from "@/lib/settings";

export const dynamic = "force-dynamic";

function ago(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const db = await getMainDb();
  const mode = await getDataMode(db);
  const last = mode === "live" ? await lastSyncRun(db) : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          ASK BOSCO <span>· Cold email economics</span>
        </div>
        <Suspense>
          <Nav />
        </Suspense>
        <div className="topbar-right">
          {mode === "mock" ? (
            <span className="badge mock" title="Showing generated sample data. Switch to live data in Settings.">
              Sample data
            </span>
          ) : (
            <>
              <span className="badge live">Live</span>
              <span className="meta">
                {last
                  ? last.status === "error"
                    ? `Last sync failed ${ago(last.started_at)}`
                    : `Synced ${ago(last.finished_at ?? last.started_at)}`
                  : "Not synced yet"}
              </span>
              <RefreshButton />
            </>
          )}
          <form action="/api/logout" method="post">
            <button className="link" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
