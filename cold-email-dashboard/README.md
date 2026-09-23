# Cold Email Economics Dashboard (ASK BOSCO)

Shows whether cold email is worth the money: spend, prospects contacted, replies, positive replies, app installs (downloads), CPL and CAC, overall, per week and per campaign. It updates itself from Smartlead once a day.

> **Customer = app install. CAC = spend ÷ installs.**

- **Overview:** KPI strip and weekly trends (Downloads, CAC, CPL, positive reply rate)
- **Campaigns:** sortable table with allocated spend, CPL and CAC per campaign; bounce rate above 3% in red
- **Settings:** costs, USD→GBP rate, cost start date, positive categories, sample/live data switch

Every view has the period toggle: This week · This month · Last month · All time.

## Two ways to run it

- **Free:** a private claude.ai page, kept up to date by a daily Claude routine. No hosting and no server. See **[docs/ARTIFACT.md](docs/ARTIFACT.md)**. Page: https://claude.ai/artifact/UiZNyWt4DpPfyFHfZm4Avn
- **Hosted:** the Next.js app below (Railway/Vercel), with a password, a Smartlead webhook for exact timestamps, and a "Refresh now" button.

Both use the same KPI code (`lib/metrics`).

## Quick start (local, sample data)

Requires Node 20.12+.

```bash
cd cold-email-dashboard
npm install
cp .env.example .env        # set DASHBOARD_PASSWORD at minimum
npm run dev                 # http://localhost:3000
```

With `DATA_MODE=mock` (the default) the dashboard runs on generated sample data: 4 campaigns plus a draft, about 8 weeks of daily snapshots, and costs starting 55 days ago. It is the same every time and moves with today's date, so every period always has data.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DASHBOARD_PASSWORD` | yes | Password for the dashboard login. Changing it logs everyone out. |
| `SESSION_SECRET` | no | Separate key for signing the login cookie (defaults to the password). |
| `DATA_MODE` | no | `mock` (default) or `live`. The Settings page toggle overrides it. |
| `SMARTLEAD_API_KEY` | for live | Smartlead → Settings → API key. Used on the server only, never sent to the browser. |
| `CRON_SECRET` | for live | Protects `/api/cron/sync` (the daily snapshot job). |
| `WEBHOOK_SECRET` | for live | Protects `/api/webhooks/smartlead`. |
| `DATABASE_URL` | no | Default `file:./data/dashboard.db`. On Railway: `file:/data/dashboard.db` (volume). For Turso: `libsql://…`. |
| `DATABASE_AUTH_TOKEN` | Turso only | Turso auth token. |

`.env` is git-ignored. Generate secrets with `openssl rand -hex 24`.

## Costs and definitions

Defaults live in **`config/defaults.ts`**: the cost table (USD/month), `usdToGbp` (0.75), `costStartDate` (2026-09-23), positive categories (`Interested`, `Meeting Request`, `Downloaded`), the download category (`Downloaded`) and the out-of-office category. Edits made on the Settings page are saved in the database and override the file. "Reset" on that page goes back to the file.

Total: $568.66/month × 0.75 = **£426.50/month**. Spend for a period = monthly total × days in the period that month ÷ days in the month, summed across months. It accrues from the cost start date up to today.

## How the numbers are worked out

| KPI | Definition | Period attribution |
|---|---|---|
| Prospects contacted | Unique leads sent ≥1 email | difference between daily cumulative snapshots |
| Emails sent | All emails, all sequence steps | snapshot difference |
| Campaigns launched | Status ACTIVE/PAUSED/STOPPED/COMPLETED, or ARCHIVED after sending; never DRAFTED | day of first send |
| Reply rate | Unique leads who replied, excluding out-of-office ÷ prospects contacted | day of first reply |
| Positive reply rate | Positive replies ÷ prospects contacted (and ÷ replies, shown underneath) | first day the lead entered a positive category |
| Downloads | Leads categorised `Downloaded` | download date (see below) |
| Bounce rate | Bounced emails ÷ emails sent | snapshot difference |
| CPL / CAC | Spend ÷ positive replies / Spend ÷ downloads | same period |
| Allocated spend | Period spend × campaign's share of emails sent | same period |

**Download date:** (1) the timestamp of the `LEAD_CATEGORY_UPDATED` webhook, else (2) a custom lead field `download_date` (YYYY-MM-DD or DD/MM/YYYY), else (3) the first daily sync that saw the lead as `Downloaded`. A lead that goes Interested (week 1) → Downloaded (week 3) counts as a positive reply in week 1 and a download in week 3.

Days, weeks (Monday–Sunday) and months use UK time. The KPI maths is in `lib/metrics/compute.ts`. **`docs/KPI_VERIFICATION.md`** checks every KPI against an independent calculation (`npm run verify`).

## Deploy

### Railway (recommended, about $5/month)

1. Push this repo to GitHub. In Railway: **New project → Deploy from GitHub repo**, and set the root directory to `cold-email-dashboard`.
2. Add a **Volume** mounted at `/data`, and set `DATABASE_URL=file:/data/dashboard.db`.
3. Set `DASHBOARD_PASSWORD`, `SMARTLEAD_API_KEY`, `CRON_SECRET`, `WEBHOOK_SECRET` (and `DATA_MODE=live` when ready).
4. **Settings → Networking → Generate domain** to get the link for the CEO.
5. **Daily job:** add a second service in the same project, of type **Cron**, with schedule `55 22 * * *` (UTC). That is 23:55 UK time in summer and 22:55 in winter, so each day's snapshot is taken near the end of that day. The start command is:
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/sync
   ```
   Any external scheduler that can call that URL also works (e.g. cron-job.org).

`railway.json` sets the build and start commands.

### Vercel + Turso (alternative)

Vercel can't keep a SQLite file, so use [Turso](https://turso.tech) (free tier): create a database, then set `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN`. Import the repo into Vercel with root directory `cold-email-dashboard` and add the same env vars. `vercel.json` already schedules `/api/cron/sync` daily at 22:55 UTC; Vercel sends `CRON_SECRET` automatically. The sync makes about 1 API call per second to respect Smartlead's rate limit, so with many campaigns it can take a few minutes. That needs a Vercel plan whose function time limit allows it (`maxDuration` is set to 300s).

### Locally, running the sync by hand

```bash
npm run sync       # one sync into DATABASE_URL, uses .env
```

## Switching sample ↔ live

**Settings → Data source → Switch to live data** (or set `DATA_MODE=live`). Before switching:

1. Set `SMARTLEAD_API_KEY`, then run `npm run explore` once to confirm the real response shapes (see `docs/SMARTLEAD_API.md`).
2. Deploy and **start the daily job before the first campaign sends**. Period figures are differences between daily snapshots, so any sending that happened before the first snapshot all lands on the first snapshot's day.
3. Press **Refresh now** (top right in live mode) to take the first snapshot straight away. Manual refreshes are limited to one every 5 minutes.

Sample data lives only in memory; switching back and forth never touches live data.

## Smartlead webhook (download timing)

The webhook gives exact timestamps for category changes and replies. Without it, dates fall back to the `download_date` field or the day the daily sync first sees the change.

**Option A: from the terminal** (account-wide, covers every campaign):

```bash
SMARTLEAD_API_KEY=... WEBHOOK_SECRET=... npm run webhook:create -- https://<your-domain>
```

**Option B: in Smartlead** go to Settings → Webhooks → Add webhook:
- URL: `https://<your-domain>/api/webhooks/smartlead?token=<WEBHOOK_SECRET>`
- Events: **Lead Category Updated** and **Email Reply**
- Scope: all campaigns (user level)

Test it by moving a test lead to `Downloaded`. The request should return `{"received":true,"handled":true}`, and the lead appears in the next sync. The `webhook_events` table keeps a log of everything received.

**Tagging installs:** when you match an install to a lead, set the lead's category to `Downloaded`. If you tag it a few days late, also set the custom lead field `download_date` to the real install date. That date is used when no webhook arrived at install time.

## Project layout

```
config/defaults.ts          costs, FX, positive categories: edit here
lib/metrics/compute.ts      all KPI maths (pure functions, unit-tested)
lib/spend.ts                pro-rated spend
lib/smartlead/              API client, response parsers, daily sync, webhook handler
lib/mock/generate.ts        sample data generator
app/(dashboard)/            Overview, Campaigns, Settings pages
app/api/                    login, cron sync, webhook
scripts/                    explore-smartlead, sync, create-webhook, verify-kpis, seed-mock
tests/                      vitest: KPI maths, webhook/sync merge, full sync against fake Smartlead
```

**Adding the v2 views:** the data is already collected.
- **Pipeline:** `leads` holds name, company, category, reply date and download date for every replied or categorised lead. Filter with `annotateLeads()` for positive leads not yet downloaded.
- **Health:** `email_account_snapshots` stores each inbox's warmup status, reputation and daily sends every day.

Add a page under `app/(dashboard)/` and a link in `components/Nav.tsx`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests |
| `npm run lint` | Type-check |
| `npm run verify` | Check every KPI against an independent calculation |
| `npm run explore` | Print real Smartlead response shapes (needs API key) |
| `npm run sync` | Run the Smartlead sync once |
| `npm run webhook:create -- <url>` | Register the Smartlead webhook |
| `npm run seed:mock` | Print the sample dataset's KPIs |
| `npm run artifact:build` | Build the claude.ai page into `artifact/dist/` |
| `npm run artifact:sync -- <in> <out>` | Daily sync for the claude.ai page (run by the routine) |
