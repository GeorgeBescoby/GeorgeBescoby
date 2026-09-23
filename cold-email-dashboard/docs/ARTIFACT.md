# Free version: private claude.ai page + daily Claude routine

No hosting bill. The dashboard is a private claude.ai artifact that only you can open. A scheduled Claude routine keeps its numbers up to date.

**Page:** https://claude.ai/artifact/UiZNyWt4DpPfyFHfZm4Avn

```
Smartlead API ──(daily routine: npm run artifact:sync)──▶ artifact database ──▶ page (same KPI code as the web app)
```

- **The page** (`artifact/src/main.ts`, built with `npm run artifact:build`) runs the same KPI code as the Next.js app (`lib/metrics`). Its Settings tab saves costs and definitions into the artifact's database. Only you can change them; anyone you share with can only look.
- **Sample vs live:** Settings → Data source. Sample data is generated in the browser, so live data is never touched.
- **Storage** (see `lib/artifact-state.ts`): `campaigns/<id>` (daily cumulative snapshots), `leads/<id>-<n>` (replied/categorised leads: a hash of the email, the category and dates; never names or addresses), `health/<month>` (inbox warmup), `settings/main`, `meta/sync`. There's plenty of room: 5,000 documents, about 25 campaigns a year uses a few hundred.

## Differences from the hosted version

- **No webhook** (there's no server to receive it). Reply and download dates come from Smartlead's reply timestamps, the `download_date` custom field, or the first daily sync that saw the change, so they're accurate to the day.
- **No "Refresh now" button.** Updates come from the daily routine, or you can run the routine by hand from claude.ai.
- **Password:** not needed. The page is private to your claude.ai account. To show the CEO, share it from the page's Share menu (they need to be in your claude.ai organisation), or show your screen.

## Switching on the daily sync

1. **Add your Smartlead API key** to this cloud environment: environment menu in the session title bar → **Edit** → add an environment variable `SMARTLEAD_API_KEY` (or under API credentials, if offered). Don't paste it into a chat.
2. **Create the routine.** Ask Claude "switch on the daily dashboard sync", or create one on claude.ai: daily at 22:55 UTC, new session each run, in this environment, with this prompt:

```text
Daily Smartlead sync for the Cold Email Economics dashboard artifact
https://claude.ai/artifact/UiZNyWt4DpPfyFHfZm4Avn

1. In the georgebescoby repo: git fetch origin claude/sharp-pasteur-rgu6a2 && git checkout claude/sharp-pasteur-rgu6a2
   (or the default branch once that has been merged), then cd cold-email-dashboard && npm ci.
2. With the ArtifactData tool, action "list", read each collection settings, campaigns, leads and health
   into out_dir /tmp/state (query.limit 1000; follow next_cursor until there is none).
3. Run: npm run artifact:sync -- /tmp/state /tmp/out
   (a non-zero exit means the Smartlead sync failed; carry on so the error is recorded on the page).
4. For each /tmp/out/batch-N.json in number order, call ArtifactData action "batch" with `writes` set to
   that file's JSON array exactly as written.
5. Finish with one line: the script's summary and the sync result. Change nothing else.
```

3. **Set the page to live:** Settings → Data source → Live Smartlead data.

Start the routine **before the first campaign sends**. Period figures are differences between daily snapshots, so anything sent before the first snapshot lands on that first day.

## Changing the page

Edit `artifact/src/main.ts` or `artifact/shell.html`, run `npm run artifact:build`, then ask Claude to republish `artifact/dist/cold-email-economics.html` to the URL above. The stored data is kept across republishes.
