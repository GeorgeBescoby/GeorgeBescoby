// Realistic, deterministic sample data. It is written into the same tables the
// live sync fills, so mock mode runs the full metrics pipeline.
//
// Timeline, relative to "today":
//   day 0            costs start (inbox warmup begins)
//   day 14 onwards   campaigns start sending, weekdays only, ramping to ~1,000/day
import { addDays, type Day } from "@/lib/dates";

export const MOCK_HISTORY_DAYS = 55;
const WARMUP_DAYS = 14;

type MockCampaign = {
  id: number;
  name: string;
  status: "ACTIVE" | "PAUSED" | "STOPPED" | "DRAFTED";
  startOffset: number; // days after sending begins
  stopOffset?: number; // stops sending this many days after sending begins
  dailyCap: number; // emails/day at full volume
  bounceRate: number;
  replyRate: number; // share of contacted leads who reply
  positiveShare: number; // share of non-OOO replies that are positive
  downloadShare: number; // share of positives that install
};

const CAMPAIGNS: MockCampaign[] = [
  { id: 1001, name: "Shopify Plus founders – ROAS angle", status: "ACTIVE", startOffset: 0, dailyCap: 380, bounceRate: 0.014, replyRate: 0.045, positiveShare: 0.34, downloadShare: 0.22 },
  { id: 1002, name: "DTC beauty – marketing leads", status: "ACTIVE", startOffset: 5, dailyCap: 320, bounceRate: 0.019, replyRate: 0.036, positiveShare: 0.3, downloadShare: 0.16 },
  { id: 1003, name: "Apparel – heads of ecommerce", status: "PAUSED", startOffset: 3, stopOffset: 30, dailyCap: 260, bounceRate: 0.043, replyRate: 0.024, positiveShare: 0.22, downloadShare: 0.1 },
  { id: 1004, name: "Home & garden – attribution test", status: "STOPPED", startOffset: 10, stopOffset: 24, dailyCap: 150, bounceRate: 0.021, replyRate: 0.03, positiveShare: 0.25, downloadShare: 0.15 },
  { id: 1005, name: "Q4 gifting – draft", status: "DRAFTED", startOffset: 999, dailyCap: 0, bounceRate: 0, replyRate: 0, positiveShare: 0, downloadShare: 0 },
];

const FIRST = ["Amelia", "Oliver", "Isla", "Harry", "Ava", "Jack", "Mia", "Noah", "Sophie", "Leo", "Grace", "Arthur", "Freya", "Oscar", "Lily", "George", "Ella", "Theo", "Ruby", "Alfie"];
const LAST = ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel", "Wright", "Walker", "Evans", "Thomas", "Roberts", "Green", "Hall", "Wood", "Clarke", "Hughes", "Khan"];
const BRANDS = ["Lumen", "Harbour", "Wildbloom", "Northfold", "Kinfolk", "Saltmarsh", "Oakly", "Verve", "Pebble", "Juniper", "Tallow", "Fernhill", "Arlo", "Mossy", "Brightside", "Quill"];
const SUFFIX = ["Skincare", "Apparel", "Home", "Co.", "Goods", "Studio", "Supply", "Botanicals"];

// mulberry32: small seeded PRNG so every run produces identical data.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isWeekday = (d: Day) => {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
};

/** ISO timestamp at a given London day + hour (BST/GMT safe for midday hours). */
const at = (d: Day, hour: number) => `${d}T${String(hour).padStart(2, "0")}:${String((hour * 7) % 60).padStart(2, "0")}:00Z`;

export type MockData = {
  costStartDate: Day;
  campaigns: { id: number; name: string; status: string; created_at: string }[];
  snapshots: { campaign_id: number; day: Day; sent: number; unique_sent: number; bounced: number }[];
  leads: {
    campaign_id: number;
    lead_id: number;
    email: string;
    first_name: string;
    last_name: string;
    company: string;
    category: string | null;
    replied: number;
    reply_at: string | null;
    download_date_field: string | null;
  }[];
  events: { campaign_id: number; email: string; category: string; occurred_at: string; source: "webhook" | "snapshot" }[];
};

export function generateMockData(todayDay: Day): MockData {
  const rand = rng(20260923);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const costStartDate = addDays(todayDay, -MOCK_HISTORY_DAYS);
  const sendStart = addDays(costStartDate, WARMUP_DAYS);

  const data: MockData = { costStartDate, campaigns: [], snapshots: [], leads: [], events: [] };
  let leadId = 500_000;

  for (const c of CAMPAIGNS) {
    const launch = addDays(sendStart, c.startOffset);
    data.campaigns.push({ id: c.id, name: c.name, status: c.status, created_at: `${addDays(launch, -2)}T09:00:00Z` });
    if (c.status === "DRAFTED") continue;

    const stop = c.stopOffset !== undefined ? addDays(sendStart, c.stopOffset) : null;
    let cum = { sent: 0, unique_sent: 0, bounced: 0 };

    for (let d = launch, i = 0; d <= todayDay; d = addDays(d, 1), i++) {
      const sending = isWeekday(d) && (!stop || d < stop);
      if (sending) {
        // Ramp over the first two weeks, today is a partial day.
        const ramp = Math.min(1, 0.35 + i * 0.05);
        const partial = d === todayDay ? 0.55 : 1;
        const sent = Math.round(c.dailyCap * ramp * partial * (0.9 + rand() * 0.2));
        // Early on most sends are first touches; later more are follow-ups.
        const firstTouchShare = i < 7 ? 0.75 : 0.4;
        const newLeads = Math.round(sent * firstTouchShare);
        let bounced = 0;
        for (let k = 0; k < sent; k++) if (rand() < c.bounceRate) bounced++;
        cum = { sent: cum.sent + sent, unique_sent: cum.unique_sent + newLeads, bounced: cum.bounced + bounced };

        // Replies from today's newly contacted leads.
        for (let k = 0; k < newLeads; k++) {
          if (rand() >= c.replyRate) continue;
          const replyDay = addDays(d, 1 + Math.floor(rand() * 9));
          if (replyDay > todayDay) continue;
          const first = pick(FIRST);
          const last = pick(LAST);
          const brand = `${pick(BRANDS)} ${pick(SUFFIX)}`;
          const lead = {
            campaign_id: c.id,
            lead_id: ++leadId,
            email: `${first.toLowerCase()}.${last.toLowerCase()}.${leadId}@${brand.split(" ")[0].toLowerCase()}.example`,
            first_name: first,
            last_name: last,
            company: brand,
            category: null as string | null,
            replied: 1,
            reply_at: at(replyDay, 10 + Math.floor(rand() * 7)),
            download_date_field: null as string | null,
          };
          data.leads.push(lead);

          // Categorise: out-of-office, positive, or other.
          const catDay = addDays(replyDay, rand() < 0.6 ? 0 : 1);
          if (catDay > todayDay) continue; // replied, not categorised yet
          const event = (category: string, day: Day, viaWebhook: boolean) =>
            data.events.push({
              campaign_id: c.id,
              email: lead.email,
              category,
              occurred_at: viaWebhook ? at(day, 14) : day,
              source: viaWebhook ? "webhook" : "snapshot",
            });

          const r = rand();
          if (r < 0.2) {
            lead.category = "Out Of Office";
            event("Out Of Office", catDay, false);
          } else if (rand() < c.positiveShare) {
            lead.category = rand() < 0.8 ? "Interested" : "Meeting Request";
            const viaWebhook = rand() < 0.7;
            event(lead.category, catDay, viaWebhook);
            // Some positives install the app a few days later.
            if (rand() < c.downloadShare) {
              const dlDay = addDays(catDay, 1 + Math.floor(rand() * 6));
              if (dlDay <= todayDay) {
                lead.category = "Downloaded";
                const s = rand();
                if (s < 0.5) event("Downloaded", dlDay, true); // webhook caught it
                else if (s < 0.75) {
                  // No webhook; George filled in download_date; tagged a day later
                  lead.download_date_field = dlDay;
                  if (addDays(dlDay, 1) <= todayDay) event("Downloaded", addDays(dlDay, 1), false);
                  else event("Downloaded", dlDay, false);
                } else event("Downloaded", dlDay, false); // first seen in a daily snapshot
              }
            }
          } else {
            lead.category = pick(["Not Interested", "Not Interested", "Wrong Person", "Do Not Contact"]);
            event(lead.category, catDay, false);
          }
        }
      }
      data.snapshots.push({ campaign_id: c.id, day: d, ...cum });
    }
  }
  return data;
}

