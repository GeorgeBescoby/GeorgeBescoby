# Smartlead API: endpoints used and response shapes

Checked against the official docs at https://api.smartlead.ai on 23 Sept 2026. No live API key was available at the time, so **the shapes below come from the docs and haven't been confirmed against real responses yet.** Run the exploration script once you have a key (see below).

## Why the parsers are tolerant

Several doc pages disagree with each other for the same endpoint:

| Endpoint | What the docs say |
|---|---|
| `GET /campaigns/` | One note says it returns "a direct array (not wrapped)"; the code samples read `response.json()['campaigns']`. |
| `GET /campaigns/{id}/analytics` | The example only has `total_sent`, `total_replied` and rates (`bounce_rate`), with no unique-sent or bounce **count**. |
| `GET /campaigns/{id}/statistics` | Three pages give three shapes: per-sequence totals, a single totals object, and per-email rows (`lead_email`, `sent_time`, `is_replied`…). |

`lib/smartlead/normalize.ts` accepts every documented variant. Where the `/analytics` response lacks unique-sent or bounce counts, the sync rebuilds lifetime totals from `/analytics-by-date`. That endpoint is documented in detail, with string counts, a `timezone` parameter and a 30-day maximum range. The sync sums 30-day windows from the campaign's creation date.

## Endpoints

| Purpose | Endpoint | Fields used |
|---|---|---|
| Campaigns + status | `GET /campaigns/` | `id`, `name`, `status` (`ACTIVE`, `PAUSED`, `STOPPED`, `ARCHIVED`, `DRAFTED`, also `COMPLETED`), `created_at` |
| Cumulative totals | `GET /campaigns/{id}/analytics` | `sent_count` / `total_sent`, `unique_sent_count`, `bounce_count` |
| Fallback totals | `GET /campaigns/{id}/analytics-by-date?start_date&end_date&timezone` | `sent_count`, `unique_sent_count` ("leads that received a first-sequence email"), `bounce_count`, `total_reply_count`, `non_ooo_reply_count` |
| Reply timestamps | `GET /campaigns/{id}/statistics?email_status=replied&limit=1000` | `lead_email`, `reply_time` (used only if present; otherwise the reply date = first sync that saw the reply) |
| Replied leads | `GET /campaigns/{id}/leads?emailStatus=is_replied&limit=100` | `data[].lead_category_id`, `data[].lead.{id,email,first_name,last_name,company_name,custom_fields}` |
| Categorised leads | `GET /campaigns/{id}/leads?lead_category_id=<id>` | same as above; catches `Downloaded` leads who never replied |
| Category names | `GET /leads/fetch-categories` | `id`, `name`, `sentiment_type` |
| Inboxes | `GET /email-accounts/?offset&limit=100` | `id`, `from_email`, `daily_sent_count`, `warmup_details.{status,warmup_reputation}` |
| Webhook setup | `POST /webhook/create` | `webhook_url`, `association_type: "user"`, `event_type_map: { LEAD_CATEGORY_UPDATED, EMAIL_REPLY }` |

## Webhook payloads

- `LEAD_CATEGORY_UPDATED`: `lead_id`, `lead_email`, `category` (name), `lead_category_id`, `campaign_id`, `lead_data`, `history`. **There's no event timestamp**, so the dashboard uses the time it receives the event.
- `EMAIL_REPLY`: `to_email` (the lead), `to_name`, `time_replied`, `campaign_id`. There's no lead ID, so leads are identified by campaign + email everywhere.
- Smartlead doesn't document webhook signing, so the URL carries a secret token (`?token=`).

## Rate limits

Standard plan: 60 requests/min, 1,000/hour, 10/s burst, shared by all endpoints. The client spaces calls about 1.1s apart and backs off on 429s (endpoint-specific 429s have no `Retry-After`). A daily sync for N campaigns makes roughly `3 + 3N + (positive categories × N)` calls. With 10 campaigns that's about 60 calls and about a minute.

## Confirming with a real key

```bash
SMARTLEAD_API_KEY=... npm run explore
```

This prints the key/type shape of every response above and saves the raw JSON to `explore-output/`. That folder is git-ignored because it contains lead data. If a shape differs from this page, adjust the matching parser in `lib/smartlead/normalize.ts`. `tests/sync.test.ts` shows the shapes each parser expects.
