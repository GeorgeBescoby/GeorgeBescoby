# KPI verification

Every KPI is calculated in two independent ways and compared:

1. **Dashboard:** `lib/metrics/compute.ts`, the code the pages use.
2. **Independent:** `scripts/verify-kpis.ts` recomputes each figure with plain SQL over the database. It walks spend day by day instead of by month segment, and runs the download-date priority (webhook > `download_date` field > snapshot) as a SQL `COALESCE`.

The run uses the sample dataset with "today" fixed at 2026-09-23. Reproduce it with `npm run verify` (or `npm run verify -- 2026-10-15` for another date). `npm test` also checks a small hand-built dataset where every expected number is written out in `tests/metrics.test.ts`.

## Hand check of the worked example (August 2026)

- Monthly cost: $94 + $189.58 + $249 + $23.08 + $13 = **$568.66** × 0.75 = **£426.495**
- August spend: all 31 days fall after the cost start date, so spend = £426.495 × 31/31 = **£426.50**
- CPL = £426.495 ÷ 32 positive replies = **£13.33**
- CAC = £426.495 ÷ 8 downloads = **£53.31**
- Reply rate = 90 ÷ 4,249 = **2.1%**. Positive reply rate = 32 ÷ 4,249 = **0.8%**. Bounce rate = 189 ÷ 8,251 = **2.3%**
- Allocated spend adds back up to the total (£426.50). The Apparel campaign (3.8% bounce) is flagged red.
- This week (Mon 21 to Wed 23 Sept) = £426.495 × 3/30 = **£42.65**. This month (1 to 23 Sept) = × 23/30 = **£326.98**
- All time (30 Jul to 23 Sept) = £426.495 × 2/31 + £426.495 + £326.98 = **£780.99**

## Output

```text
Mock data for today = 2026-09-23; costs start 2026-07-30; monthly cost £426.495

This week (2026-09-21 → 2026-09-23), campaigns launched: 0
┌─────────┬──────────────────────────┬───────────┬─────────────┬───────┐
│ (index) │ KPI                      │ dashboard │ independent │ match │
├─────────┼──────────────────────────┼───────────┼─────────────┼───────┤
│ 0       │ 'spend'                  │ '£42.65'  │ '£42.65'    │ '✓'   │
│ 1       │ 'prospectsContacted'     │ '698'     │ '698'       │ '✓'   │
│ 2       │ 'emailsSent'             │ '1,744'   │ '1,744'     │ '✓'   │
│ 3       │ 'replies'                │ '22'      │ '22'        │ '✓'   │
│ 4       │ 'positiveReplies'        │ '6'       │ '6'         │ '✓'   │
│ 5       │ 'downloads'              │ '4'       │ '4'         │ '✓'   │
│ 6       │ 'bounced'                │ '18'      │ '18'        │ '✓'   │
│ 7       │ 'replyRate'              │ '3.15%'   │ '3.15%'     │ '✓'   │
│ 8       │ 'positiveReplyRate'      │ '0.86%'   │ '0.86%'     │ '✓'   │
│ 9       │ 'positiveShareOfReplies' │ '27.27%'  │ '27.27%'    │ '✓'   │
│ 10      │ 'bounceRate'             │ '1.03%'   │ '1.03%'     │ '✓'   │
│ 11      │ 'cpl'                    │ '£7.11'   │ '£7.11'     │ '✓'   │
│ 12      │ 'cac'                    │ '£10.66'  │ '£10.66'    │ '✓'   │
│ 13      │ 'replyToDownloadRate'    │ '66.67%'  │ '66.67%'    │ '✓'   │
└─────────┴──────────────────────────┴───────────┴─────────────┴───────┘
This month (2026-09-01 → 2026-09-23), campaigns launched: 0
┌─────────┬──────────────────────────┬───────────┬─────────────┬───────┐
│ (index) │ KPI                      │ dashboard │ independent │ match │
├─────────┼──────────────────────────┼───────────┼─────────────┼───────┤
│ 0       │ 'spend'                  │ '£326.98' │ '£326.98'   │ '✓'   │
│ 1       │ 'prospectsContacted'     │ '5,820'   │ '5,820'     │ '✓'   │
│ 2       │ 'emailsSent'             │ '14,551'  │ '14,551'    │ '✓'   │
│ 3       │ 'replies'                │ '195'     │ '195'       │ '✓'   │
│ 4       │ 'positiveReplies'        │ '59'      │ '59'        │ '✓'   │
│ 5       │ 'downloads'              │ '13'      │ '13'        │ '✓'   │
│ 6       │ 'bounced'                │ '303'     │ '303'       │ '✓'   │
│ 7       │ 'replyRate'              │ '3.35%'   │ '3.35%'     │ '✓'   │
│ 8       │ 'positiveReplyRate'      │ '1.01%'   │ '1.01%'     │ '✓'   │
│ 9       │ 'positiveShareOfReplies' │ '30.26%'  │ '30.26%'    │ '✓'   │
│ 10      │ 'bounceRate'             │ '2.08%'   │ '2.08%'     │ '✓'   │
│ 11      │ 'cpl'                    │ '£5.54'   │ '£5.54'     │ '✓'   │
│ 12      │ 'cac'                    │ '£25.15'  │ '£25.15'    │ '✓'   │
│ 13      │ 'replyToDownloadRate'    │ '22.03%'  │ '22.03%'    │ '✓'   │
└─────────┴──────────────────────────┴───────────┴─────────────┴───────┘
Last month (2026-08-01 → 2026-08-31), campaigns launched: 4
┌─────────┬──────────────────────────┬───────────┬─────────────┬───────┐
│ (index) │ KPI                      │ dashboard │ independent │ match │
├─────────┼──────────────────────────┼───────────┼─────────────┼───────┤
│ 0       │ 'spend'                  │ '£426.50' │ '£426.50'   │ '✓'   │
│ 1       │ 'prospectsContacted'     │ '4,249'   │ '4,249'     │ '✓'   │
│ 2       │ 'emailsSent'             │ '8,251'   │ '8,251'     │ '✓'   │
│ 3       │ 'replies'                │ '90'      │ '90'        │ '✓'   │
│ 4       │ 'positiveReplies'        │ '32'      │ '32'        │ '✓'   │
│ 5       │ 'downloads'              │ '8'       │ '8'         │ '✓'   │
│ 6       │ 'bounced'                │ '189'     │ '189'       │ '✓'   │
│ 7       │ 'replyRate'              │ '2.12%'   │ '2.12%'     │ '✓'   │
│ 8       │ 'positiveReplyRate'      │ '0.75%'   │ '0.75%'     │ '✓'   │
│ 9       │ 'positiveShareOfReplies' │ '35.56%'  │ '35.56%'    │ '✓'   │
│ 10      │ 'bounceRate'             │ '2.29%'   │ '2.29%'     │ '✓'   │
│ 11      │ 'cpl'                    │ '£13.33'  │ '£13.33'    │ '✓'   │
│ 12      │ 'cac'                    │ '£53.31'  │ '£53.31'    │ '✓'   │
│ 13      │ 'replyToDownloadRate'    │ '25.00%'  │ '25.00%'    │ '✓'   │
└─────────┴──────────────────────────┴───────────┴─────────────┴───────┘
All time (2026-07-30 → 2026-09-23), campaigns launched: 4
┌─────────┬──────────────────────────┬───────────┬─────────────┬───────┐
│ (index) │ KPI                      │ dashboard │ independent │ match │
├─────────┼──────────────────────────┼───────────┼─────────────┼───────┤
│ 0       │ 'spend'                  │ '£780.99' │ '£780.99'   │ '✓'   │
│ 1       │ 'prospectsContacted'     │ '10,069'  │ '10,069'    │ '✓'   │
│ 2       │ 'emailsSent'             │ '22,802'  │ '22,802'    │ '✓'   │
│ 3       │ 'replies'                │ '285'     │ '285'       │ '✓'   │
│ 4       │ 'positiveReplies'        │ '91'      │ '91'        │ '✓'   │
│ 5       │ 'downloads'              │ '21'      │ '21'        │ '✓'   │
│ 6       │ 'bounced'                │ '492'     │ '492'       │ '✓'   │
│ 7       │ 'replyRate'              │ '2.83%'   │ '2.83%'     │ '✓'   │
│ 8       │ 'positiveReplyRate'      │ '0.90%'   │ '0.90%'     │ '✓'   │
│ 9       │ 'positiveShareOfReplies' │ '31.93%'  │ '31.93%'    │ '✓'   │
│ 10      │ 'bounceRate'             │ '2.16%'   │ '2.16%'     │ '✓'   │
│ 11      │ 'cpl'                    │ '£8.58'   │ '£8.58'     │ '✓'   │
│ 12      │ 'cac'                    │ '£37.19'  │ '£37.19'    │ '✓'   │
│ 13      │ 'replyToDownloadRate'    │ '23.08%'  │ '23.08%'    │ '✓'   │
└─────────┴──────────────────────────┴───────────┴─────────────┴───────┘

Worked example: Last month (2026-08-01 → 2026-08-31)
  Monthly cost      = $94 + $189.58 + $249 + $23.08 + $13 = $568.66 × 0.75 = £426.495
  Spend             = £426.495 × 31/31 days = £426.495
  Reply rate        = 90 ÷ 4249 = 2.12%
  Positive rate     = 32 ÷ 4249 = 0.75%  (35.56% of replies)
  Bounce rate       = 189 ÷ 8251 = 2.29%
  CPL               = £426.495 ÷ 32 = £13.33
  CAC               = £426.495 ÷ 8 = £53.31
  Reply → download  = 8 ÷ 32 = 25.00%

  Allocated spend (spend × campaign emails ÷ 8251 total emails):
    Shopify Plus founders – ROAS angle   £426.50 ×  3700 ÷ 8251 = £191.25  CAC £23.91  bounce 1.68%
    DTC beauty – marketing leads         £426.50 ×  2066 ÷ 8251 = £106.79  CAC —  bounce 1.98%
    Apparel – heads of ecommerce         £426.50 ×  2022 ÷ 8251 = £104.52  CAC —  bounce 3.81%  ▲ red
    Home & garden – attribution test     £426.50 ×   463 ÷ 8251 = £23.93  CAC —  bounce 1.94%
    Sum of allocated spend = £426.50 (should equal total spend £426.50)

✓ All KPIs match the independent calculation.
```
