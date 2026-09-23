import type { Day } from "@/lib/dates";

export type CampaignRow = {
  id: number;
  name: string;
  status: string;
  created_at: string | null;
};

export type SnapshotRow = {
  campaign_id: number;
  day: Day;
  sent: number;
  unique_sent: number;
  bounced: number;
};

export type LeadRow = {
  campaign_id: number;
  email: string; // hashed email key (leadKey), identifies the lead within a campaign
  lead_id: number | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  category: string | null;
  replied: number;
  reply_at: string | null;
  download_date_field: string | null;
};

export type CategoryEventRow = {
  campaign_id: number;
  email: string;
  category: string;
  occurred_at: string;
  source: "webhook" | "snapshot";
};

export type Dataset = {
  campaigns: CampaignRow[];
  snapshots: SnapshotRow[];
  leads: LeadRow[];
  categoryEvents: CategoryEventRow[];
};

/** Counts for one campaign (or all campaigns) over one period. */
export type Counts = {
  emailsSent: number;
  prospectsContacted: number;
  bounced: number;
  replies: number; // unique leads, excluding out-of-office
  positiveReplies: number;
  downloads: number;
};

export type Kpis = Counts & {
  spend: number;
  campaignsLaunched: number;
  campaignsLaunchedTotal: number;
  replyRate: number | null;
  positiveReplyRate: number | null;
  positiveShareOfReplies: number | null;
  bounceRate: number | null;
  cpl: number | null;
  cac: number | null;
  replyToDownloadRate: number | null;
};

export type CampaignKpis = Counts & {
  id: number;
  name: string;
  status: string;
  allocatedSpend: number;
  replyRate: number | null;
  positiveReplyRate: number | null;
  bounceRate: number | null;
  cpl: number | null;
  cac: number | null;
};

export type TrendPoint = {
  weekStart: Day;
  label: string;
  spend: number;
  downloads: number;
  positiveReplies: number;
  prospectsContacted: number;
  cac: number | null;
  cpl: number | null;
  positiveReplyRate: number | null;
};
