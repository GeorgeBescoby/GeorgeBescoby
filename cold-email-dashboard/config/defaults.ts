// Default dashboard settings — the single place to edit costs and definitions.
//
// Values edited on the Settings page are stored in the database and override
// these defaults. "Reset to defaults" on that page restores what's here.

export type CostItem = {
  key: string;
  label: string;
  basis: string;
  usdPerMonth: number;
};

export type Settings = {
  costs: CostItem[];
  usdToGbp: number;
  costStartDate: string; // YYYY-MM-DD; costs accrue from this date (includes warmup)
  positiveCategories: string[]; // lead categories that count as a positive reply
  downloadCategory: string; // lead category that means "installed the app"
  oooCategories: string[]; // categories excluded from reply counts (out-of-office)
  bounceAlertPct: number; // bounce rate above this is highlighted red
};

export const DEFAULT_SETTINGS: Settings = {
  costs: [
    { key: "smartlead", label: "Smartlead Pro", basis: "$94/month", usdPerMonth: 94.0 },
    {
      key: "premium_inboxes",
      label: "Premium Inboxes",
      basis: "$175 every 4 weeks (50 × $3.50) × 13 ÷ 12",
      usdPerMonth: 189.58,
    },
    { key: "prospeo", label: "Prospeo", basis: "$249/month (15,000 credits)", usdPerMonth: 249.0 },
    { key: "domains", label: "Domains", basis: "25 × $11.08/year ÷ 12", usdPerMonth: 23.08 },
    { key: "truelist", label: "Truelist", basis: "Pay-as-you-go, fixed estimate", usdPerMonth: 13.0 },
  ],
  usdToGbp: 0.75,
  costStartDate: "2026-09-23",
  positiveCategories: ["Interested", "Meeting Request", "Downloaded"],
  downloadCategory: "Downloaded",
  oooCategories: ["Out Of Office"],
  bounceAlertPct: 3,
};

// Timezone used for "days", "weeks" (Mon–Sun) and "months".
export const TIMEZONE = "Europe/London";
