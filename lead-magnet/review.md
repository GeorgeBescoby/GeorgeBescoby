# Review of the finished example: TALA

Report: [`example/wearetala-com.html`](example/wearetala-com.html), generated 17 Oct 2026 from wearetala.com's public storefront by `bfcm_check/bfcm_check.py`.

What it says, in one breath: 910 live products, 31% of variants sold out. 268 products are missing a core size: 101 have a gap in the middle of the run, 167 are nearly gone. 472 are at full price with every size in stock, 99 are fully sold out but still live, and 79 buyable products are already marked down (median 70% off). 8 platforms are tagged that will each report their own BFCM sales. There's a leftover Universal Analytics tag, and Pinterest is loaded twice.

## Spot checks against live data

| Claim in the report | Checked how | Result |
|---|---|---|
| "DayFlex Wrap High Waisted Legging – Light Moss is out in XS, S" | `/products/{handle}.js` fetched separately | ✅ XS and S unavailable in both FULL and 7/8 lengths. M, L and XL available. |
| "686 reviews" on that legging | Yotpo bottomline API | ✅ 686 reviews, 4.4★ |
| Median markdown 70% | Inspected variants | ✅ Summer swim and linen lines at £20.70 vs £69.00 compare-at, etc. Real, not a data bug. |
| UA-141233405-2 still present | grep of the GTM container | ✅ Present |
| Pinterest as app pixel + in GTM | `webPixelsConfigList` has `tagID`, and GTM contains `s.pinimg.com/ct` | ✅ Both present |
| Meta tagged | GTM contains `connect.facebook.net/…fbevents` | ✅ (via GTM, not the Shopify Meta app) |

## Things the review caught and fixed

These were in the first build and are gone now.

| Problem | Principle broken | Fix |
|---|---|---|
| "A Black Friday offer here is the first discount they've had" | Truth: we only know they aren't marked down *today* | Now: "none of them is marked down today, so any offer comes off full price and doesn't stack on an existing sale" |
| "See which **products** are profitable" in the ASK BOSCO answer | Truth: product-level profit isn't in the stated capabilities | Now campaign-level: "which campaigns are actually profitable" |
| Example question "which products sold out fastest…" | Truth: assumes inventory history in ASK BOSCO, which isn't confirmed | Now "top 20 products by revenue in the last 30 days, and which channels those orders came from" |
| "Every ad platform counts a conversion for any order it touched" | Truth: overstated mechanism | Now "credits itself with orders that followed a click or view inside its own attribution window" |
| "Pinterest **will** count orders twice" | Truth: we can't see whether both tags fire purchase events | Now "**could** count some orders twice… worth a quick check" |
| "None… is missing a core size, which is unusual this close to Black Friday" (clean-stock brands) | Truth: "unusual" has no basis | Removed. States the counts only. |
| Markdown stats included fully sold-out products | Truth/usefulness: stacking only matters on buyable items | Markdown section and KPI now only count in-stock products (118 → 79) |
| One undifferentiated list of 268 "fix" products | Grounded but misleading: most are end-of-line, not restock gaps | Split into "gap in the middle of the run" (101) and "nearly gone" (167) |
| Review counts only fetched for the first 160 products, so ranking was biased by catalogue order | Truth: "most-reviewed first" wasn't true | All products now looked up (cheap, parallel) |
| Ready list showed four colourways of the same bra | Competence: looked machine-made | Ready list now groups colourways into one style row |
| Wide size runs (Snag's A–J) flagged on a single middle-size gap | Truth: over-flagging inclusive-size brands | Products with many core sizes need ≥25% of core sizes out |
| "Message Card" chosen as Grind's example product | Competence | Gift wrap and message cards are excluded as non-products |
| Snag/Grind-style catalogues told "every size in stock" when they have no sizes | Truth | Says "everything in stock" when under 30% of the range is sized |

## Re-scoring the finished example against every principle

Key: ✅ achieved · ❌ not achieved · ⚠️ grey area / unsure

### 1. It's a slice of the offer itself
| Bullet | Mark | Reason |
|---|---|---|
| Micro version of the full offer's deliverables | ⚠️ | It's a joined-up report across Shopify catalogue data and the marketing stack, with plain-English findings, which is ASK BOSCO's kind of output. But size-level stock isn't what ASK BOSCO markets itself on. |
| Substance comes from what the product does | ⚠️ | The "who's counting" and "what this can't see" sections come straight from the product (joined platforms, conflicting numbers, historical data, hourly updates). The stock analysis comes from the Shopify data ASK BOSCO ingests, not from a headline feature. |
| Test: wouldn't make sense if the offer didn't exist | ⚠️ | Improved from ❌. Without ASK BOSCO, half of the report (sections 5 and 6) makes no sense. The stock half would still make sense from an inventory or merch tool. |

### 2. It's genuinely useful
| Bullet | Mark | Reason |
|---|---|---|
| Solves a problem that exists | ✅ | 31% of variants sold out and 101 mid-run gaps, 41 days before their biggest week, plus 79 marked-down items a sitewide code could stack onto. Visible, real, time-bound. |
| Complete, usable result by itself | ✅ | Every product is named, with which sizes are out and in, linked to the PDP. The full lists are expandable. Nothing is held back. |
| Something they don't already have / couldn't easily make | ⚠️ | TALA's merch team has inventory reports. What they likely don't have is this cut (core-size gaps × full-price × markdown stacking × review count) in one page. A competent analyst could build it in a morning. |
| Immediately actionable and self-evident | ✅ | "Restock or swap these", "these are ready", "decide whether sale lines are in or out", "remove the UA tag", "check Pinterest dedup". |
| Test: useful to someone who doesn't know/like/trust you | ✅ | A list of your own best-reviewed leggings that are out in S is useful whoever sends it |

### 3. It requires nothing from the prospect
| Bullet | Mark | Reason |
|---|---|---|
| Only has to raise their hand | ✅ | Reply "yes" and get one HTML file or link |
| No money, time, access, forms or logistics | ✅ | Single file, works on a phone, no login |
| Test: raise hand and sit back | ✅ | |

### 4. It's a genuine no-brainer
| Bullet | Mark | Reason |
|---|---|---|
| No reason at all to say no | ✅ | It's their own products and their own peak week |
| Zero consequences if it's bad | ✅ | |
| Value obvious without imagining | ✅ | The headline in the email ("{N} products missing a core size, e.g. X out in S") shows the value before they open it |
| Test: saying no almost feels stupid | ⚠️ | For most brands, yes. A brand with a tight merch team might think "we know", and some will be wary of a vendor email. |

### 5. It proves competence & understanding
| Bullet | Mark | Reason |
|---|---|---|
| "These guys know what they're doing" | ✅ | 5,352 variants read, core-size logic, colourway grouping, discount stacking maths, GTM container read, dedup risk spotted |
| Effort through specificity, not length | ✅ | Product names, sizes, prices, review counts, their tag IDs. It's long, but you only need to read the top screen. |
| Understands their business beyond a quick look at the website | ✅ | Nobody gets "S is the size missing most often (207 products)" or "UA tag still in GTM" from browsing |
| Knows things they don't / can do things they can't | ⚠️ | The tag findings may well be new to them. The stock picture they own internally. The surprise is that we could build it from outside. |
| Test: couldn't be sent to anyone else | ✅ | Every row is TALA's |

### 6. It's grounded in truth
| Bullet | Mark | Reason |
|---|---|---|
| Based on what we can see or reasonably infer | ✅ | Every number is a count over public JSON at a stated timestamp. Spot-checked above. |
| Correct based on what's visible | ✅ | Spot checks pass. Caveats are in the footer: pre-order/oversell shows as in stock, no quantities, Yotpo may share counts across colourways. |
| Never claims internal numbers or invisible problems | ✅ | After the fixes: "if any of these are in your ads", "could count twice", "a tag being present doesn't prove live spend", "we don't know your Black Friday plans" |
| Test: "I can see why you'd think that" | ⚠️ | Mostly. The "nearly gone" list will include lines TALA is deliberately ending. The copy says "fine if they're ending", but the headline count of 268 still includes them. I kept it because it is literally true, but the email hook should quote the gaps (101), not 268. |

### 7. It bridges to the core offer
| Bullet | Mark | Reason |
|---|---|---|
| Main offer feels like the natural next step | ✅ | Section 6 turns each limit of the report into an ASK BOSCO answer. The CTA is a self-serve App Store install with a 14-day trial. |
| Solves one part well, makes the bigger problem visible | ✅ | Solves "what's ready". Shows "8 platforms, 8 different BFCM numbers" and "which campaigns actually make money?" |
| Prospect sees exactly how the offer continues it | ✅ | Each "what we can see" box is paired with an ASK BOSCO box |
| "What else could they do for me?" | ✅ | The tag housekeeping and the last-year BFCM comparison both invite it |
| Test: next question leads to the offer | ✅ | "OK, which of these should I actually put money behind?" can only be answered with spend + sales data |

**Tally:** 22 ✅ · 7 ⚠️ · 0 ❌ (the idea-stage scoring had 23 / 5 / 1). The ❌ on "wouldn't make sense without the offer" moved to ⚠️ through the stack and "can't see" sections. Two ✅ honestly became ⚠️ once I looked at the real output: "saying no feels stupid" and the "I can see why you'd think that" test, because of the 268 headline.

## Remaining grey areas I chose not to "fix"

- **The 268 headline.** It's true, but it's the bigger, scarier number. The script outputs `n_gaps` separately, and I recommend the email quotes the gaps.
- **Awin is outlined as an ASK BOSCO connection.** The brief says "affiliates" without naming networks. Confirm which affiliate networks are supported. The list is `ASKBOSCO_CONNECTS` in the script.
- **"Last year's BFCM is there to compare."** This assumes the historical backfill reaches Nov 2025 (about 11 months). Confirm how far back the backfill goes.
- **Ordering when a brand has no Yotpo.** The fallback is "most core sizes out, then price". That's honest, but it's weaker than review ranking, and that's stated in the report.
