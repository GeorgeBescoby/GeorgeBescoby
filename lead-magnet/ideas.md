# Lead magnet ideas for ASK BOSCO cold email

Context: today is **17 Oct 2026**, and Black Friday is **27 Nov 2026 (41 days away)**. Every idea below is limited to what [the public data research](research/public-data-research.md) showed we can actually fetch at scale: the products.json catalogue (price, markdown, size-level stock, launch dates), meta.json, the marketing stack (Shopify web pixels plus the public GTM container) and, for Yotpo stores only, review counts. Ad libraries, traffic, revenue and sales rank are **not** available, so no idea depends on them.

Key: ✅ achieved · ❌ not achieved · ⚠️ grey area / unsure

---

## Idea A: Black Friday Stock & Spend Check

**One line:** A per-brand report, 41 days before Black Friday, that sorts every live product into **Fix first / Ready to push / Check before you spend**, based on size-level stock and current markdowns. It also lists every ad and analytics platform that will report its own version of their BFCM results.

**What's in it**
1. Headline numbers: live products and variants, % of variants sold out right now, % of products already marked down (and average depth), launches in the last 90 days.
2. **Fix first:** products missing one or more *core* sizes (e.g. S, M or L), named, with which sizes are out, price and category. These are the products where BFCM ad clicks are most likely to land on "sold out in your size".
3. **Ready to push:** full-price products with every size in stock, listed by category. These have the most room for a BFCM offer. Sorted by price, with review counts shown where Yotpo is present.
4. **Check before you spend:** fully sold-out products that are still published, and products already marked down, where a sitewide BFCM code would stack on the existing discount (worked example: 30% + 20% = 44% off).
5. Category table: sold-out share and markdown share per product type.
6. **Who's counting your Black Friday:** every ad, email, affiliate and analytics platform tagged on their checkout (e.g. Meta, Google Ads, TikTok, Pinterest, Microsoft, Klaviyo, Awin, GA4), and why their BFCM numbers won't agree.
7. **What this can't see:** the questions only their own data answers (profit per product and channel, last year's BFCM), and how ASK BOSCO answers them.

**Where every piece of data comes from**
| Element | Source |
|---|---|
| Products, prices, compare-at prices, size/variant availability, product types, launch dates | `https://{domain}/products.json?limit=250&page=N` |
| Currency, store name, country, published product count | `https://{domain}/meta.json` |
| App pixels (Meta, TikTok, Pinterest, Klaviyo, Yotpo…) | `webPixelsConfigList` in the homepage HTML |
| GA4, Google Ads, GTM IDs | Homepage HTML |
| Tags inside GTM (Meta, TikTok, Bing, Awin…) | `https://www.googletagmanager.com/gtm.js?id={GTM-ID}` |
| Review counts (optional) | `api.yotpo.com/products/{key}/{id}/bottomline`, only when a Yotpo key is present |
| Days to Black Friday | Calendar (27 Nov 2026) |

**Cold email hook**
> Subject: TALA – 6 weeks to Black Friday
>
> Hi {first name}, I ran a Black Friday stock check on TALA's site this morning. {N} products are already missing a core size (e.g. the {product} is out in {sizes}), and you've got {M} platforms tagged that will each report their own BFCM numbers. I've put it all in a one-page report, with the full fix list and the products that are ready to push. Want me to send it over?

---

## Idea B: "Who's counting your Black Friday?" Measurement Stack Map

**One line:** A map of every platform that tracks the brand's storefront and checkout, showing where the numbers will disagree on 1 December, plus tag-hygiene flags.

**What's in it**
- Every platform detected (ad networks, email/SMS, affiliates, analytics, heatmaps, reviews), each with the attribution logic it uses by default
- "On BFCM weekend, {N} platforms will each claim credit for the same orders"
- Hygiene flags: legacy Universal Analytics tags still in GTM, multiple GA4 IDs, pixels loaded twice (app pixel *and* GTM), affiliate networks and paid social both tagged (double-paying risk)
- Which of these ASK BOSCO connects

**Data sources:** homepage HTML (`webPixelsConfigList`, inline IDs), the public GTM container, meta.json.

**Cold email hook**
> I counted {N} different platforms tracking TALA's checkout (Meta, TikTok, Pinterest, Google Ads, Microsoft, Awin, Klaviyo, GA4…). Come 1 December they'll each give you a different Black Friday number. I mapped which ones overlap and spotted a couple of leftover tags. Want the map?

---

## Idea C: Competitor Benchmark Snapshot

**One line:** The prospect against 4 look-alike Shopify brands on public signals: catalogue size, launch cadence, share of catalogue marked down right now, sold-out share, review volume and channels tagged.

**What's in it:** a scorecard table, charts of launches per month over 12 months, "who's discounting already before BFCM", and channel overlap.

**Data sources:** products.json and meta.json for each brand, pixels/GTM. **Competitor choice:** needs either a category database (e.g. Store Leads, which is paid) or a hand-made list per vertical.

**Cold email hook**
> I benchmarked TALA against {Comp1}, {Comp2}, {Comp3} and {Comp4} from their public storefronts. One of them already has 31% of its range marked down six weeks before Black Friday. Want the comparison?

---

## Idea D: "Your Monday-morning questions, pre-answered"

**One line:** A sample of the AI analyst: 8 questions their team will ask after BFCM, each answered as far as public data allows, with the exact point where their own data would be needed.

**What's in it:** Q&A cards such as "Which categories are we most exposed on for stock?" (answered), "What's our real BFCM ROAS by channel?" (shows the gap), "Did launches in the last 90 days sell through?" (partially answered via availability).

**Data sources:** the same as A and B.

**Cold email hook**
> I asked our AI analyst the 8 questions TALA's team will ask on 1 December, using only your public site. It could answer 4. Want to see the answers, and the 4 it couldn't?

---

# Scoring every idea against every principle

## 1. It's a slice of the offer itself

| Bullet | A Stock & Spend | B Stack Map | C Benchmark | D Questions |
|---|---|---|---|---|
| Micro version of the full offer's deliverables | ⚠️ It's a report that joins Shopify catalogue data with the marketing stack, which is the *kind* of output ASK BOSCO produces. But stock readiness isn't a headline ASK BOSCO deliverable. | ✅ The platform list *is* the set of sources ASK BOSCO joins up | ✅ Competitor benchmarking is a listed ASK BOSCO feature, including in the Shopify app ("Benchmarking") | ✅ A miniature of the AI interface |
| Substance comes from what the product does, not just the topic | ⚠️ "Which products deserve BFCM spend" is an ASK BOSCO-style question (Shopify + ads data combined), but our answer is mostly Shopify data | ✅ Directly about "ad platforms each claim different numbers", a core problem it solves | ✅ Same data shape the benchmarking feature uses | ✅ Question → answer across datasets |
| Test: wouldn't make sense if the offer didn't exist | ❌ Honestly, an inventory tool or agency could send a stock check. The stack section and "what this can't see" are what tie it to ASK BOSCO. | ✅ It only makes sense from someone who unifies these platforms | ⚠️ A market-intelligence tool could send the same thing | ✅ Only makes sense from an AI analytics product |

## 2. It's genuinely useful

| Bullet | A | B | C | D |
|---|---|---|---|---|
| Solves a problem that exists | ✅ Sold-out sizes on promoted products, and discount stacking, are real BFCM problems at day 41 | ⚠️ Conflicting numbers is a real problem, but a map doesn't solve it, it just shows it | ⚠️ "What are competitors doing" is a real question, but not a pain | ⚠️ Shows the problem more than it solves it |
| Delivers a complete, usable result by itself | ✅ Named products, named sizes, three action lists | ⚠️ Complete as a map, but the fix (reconciling numbers) is held back by nature | ✅ Complete comparison | ❌ By design half the answers are "we need your data", which is holding back |
| Something they likely don't already have or couldn't easily make | ⚠️ Shopify admin has inventory reports, but not "core sizes out × full-price × markdown stacking" as one BFCM view. A merchandiser could build it in a few hours. | ❌ Their marketer mostly knows what's installed (leftover tags are the exception) | ✅ Competitor data across 4 stores is tedious to build by hand | ⚠️ The answered half is stuff they know |
| Immediately actionable and self-evident | ✅ "Restock or swap these 12 before you build ads; these 40 are ready" | ⚠️ "Remove the old UA tag" is actionable but small. The main finding is "so what?" until you have a tool. | ❌ "Competitor X is discounting 31%" → "okay, now what?" | ❌ Ends on a gap |
| Test: useful to someone who doesn't know/like/trust you | ✅ A list of their own products missing sizes is useful from anyone | ⚠️ Mildly | ⚠️ Interesting rather than useful | ❌ Reads as a demo |

## 3. It requires nothing from the prospect

| Bullet | A | B | C | D |
|---|---|---|---|---|
| Only has to raise their hand | ✅ Reply "yes" | ✅ | ✅ | ✅ |
| No money, time, access, forms or logistics | ✅ One HTML link or attachment, readable on a phone | ✅ | ✅ | ✅ |
| Test: raise hand and sit back | ✅ | ✅ | ✅ | ✅ |

## 4. It's a genuine no-brainer

| Bullet | A | B | C | D |
|---|---|---|---|---|
| No reason at all to say no | ✅ It's their own products, 41 days before their biggest week | ⚠️ "We already know our stack" | ⚠️ Some founders don't care about competitors | ⚠️ Looks like a product demo, so some will smell a pitch |
| Zero consequences if it's bad | ✅ | ✅ | ✅ | ✅ |
| Value obvious without imagining | ✅ "Products missing sizes before Black Friday" needs no explaining | ⚠️ Value depends on believing the attribution problem | ✅ | ⚠️ |
| Test: saying no almost feels stupid | ✅ Mostly. A brand with a tight merch team may feel they've got it, but checking costs them nothing. | ❌ | ⚠️ | ❌ |

## 5. It proves competence & understanding

| Bullet | A | B | C | D |
|---|---|---|---|---|
| Shows "these guys know what they're doing" | ✅ Size-level, category-level and discount-stacking analysis of 900+ products, done for them | ✅ Reading their GTM container is a technical move most don't know is possible | ✅ | ⚠️ Depends on answer quality |
| Feels like effort through specificity, not length | ✅ Their product names, their sizes, their prices | ✅ Their exact tag IDs and platforms | ✅ Their named competitors | ⚠️ |
| Understands their business beyond a quick website look | ✅ Nobody sees size-level stock on 5,000 variants from a quick look | ✅ Nobody sees GTM contents from a quick look | ⚠️ The competitor choice could be off | ⚠️ |
| Sender knows things they don't, or can do things they can't | ⚠️ They have this data internally. The new part is the cut, and the fact that we can do it at all from outside. | ⚠️ Leftover tags, maybe | ✅ They can't easily see competitors' stock and markdowns at this depth | ⚠️ |
| Test: couldn't be sent to someone else | ✅ Every row is theirs | ✅ | ✅ | ⚠️ Question set is generic, answers are specific |

## 6. It's grounded in truth

| Bullet | A | B | C | D |
|---|---|---|---|---|
| Based on what the sender can see or reasonably infer | ✅ Every number is a count over products.json at a timestamp | ✅ Tags in public code | ✅ | ✅ |
| Correct based on what's visible | ✅ With caveats: `available` is in/out only, pre-order and oversell can show "in stock" | ⚠️ A tag in GTM may be paused or not firing. "Tagged", not "active spend". | ⚠️ "Look-alike" competitors are our judgement | ✅ |
| Never claims internal numbers or invisible problems | ⚠️ The risk is framing: "these products will lose sales" would overclaim, because we don't know which they plan to promote or how much stock is coming. Copy must say "if you plan to promote them". | ⚠️ "Your numbers will disagree" is a general truth about ad platforms, not a claim about their accounts. Must be framed that way. | ✅ | ⚠️ Answers can drift into guessing |
| Test: "I can see why you'd think that" | ✅ | ✅ | ⚠️ "They're not our competitor" | ✅ |

## 7. It bridges to the core offer

| Bullet | A | B | C | D |
|---|---|---|---|---|
| Main offer feels like the natural next step | ✅ "This shows what's *ready*. ASK BOSCO shows what's *profitable*: the same products joined with your spend from the {N} platforms we found." | ✅ Strongest of all: "join these {N} sources in one place" is the product | ✅ "Benchmark your real numbers in ASK BOSCO" | ✅ "Ask the other 4 questions in the product" |
| Solves one part well, makes the bigger problem visible | ✅ Solves stock readiness. Makes visible "but which of these makes money after ad cost, by channel?" | ⚠️ Mostly shows, solves little | ⚠️ | ⚠️ |
| Prospect sees exactly how the offer continues it | ✅ The "What this can't see" section maps each gap to the data ASK BOSCO connects | ✅ | ⚠️ | ✅ |
| "What else could they do for me?" | ✅ | ✅ | ⚠️ | ✅ |
| Test: their next question leads to the offer | ✅ "Which of these actually make money?" is answered by ASK BOSCO | ✅ "How do I see one number?" | ⚠️ Next question might be "who else is discounting?" | ✅ |

---

# Ranking and choice

| Rank | Idea | ✅ | ⚠️ | ❌ | Verdict |
|---|---|---|---|---|---|
| 1 | **A. Black Friday Stock & Spend Check** | 23 | 5 | 1 | Most useful and most actionable. The one ❌ is real: on its own it's not uniquely ASK BOSCO. |
| 2 | B. Measurement Stack Map | 17 | 10 | 2 | The perfect bridge, but not useful enough by itself |
| 3 | C. Competitor Benchmark | 16 | 12 | 1 | Strong slice, weak "now what", and competitor picking isn't fully automatable without a paid database |
| 4 | D. Questions pre-answered | 14 | 11 | 4 | A demo pretending to be a deliverable. It holds back the answer by design. |

**Choice: A, with B's best part folded in as the bridge section.**

Why:
- **Usefulness is what wins the reply in cold email.** A is the only idea where the prospect gets something they'd act on this week whoever sent it: named products, missing in named sizes, 41 days before Black Friday. The timing makes it urgent and it can't be faked. Next year it's a different report.
- **It's 100% automatable from data we reliably get.** products.json worked on every standard Shopify store tested. Headless stores (Huel) fail cleanly and can be filtered out before sending.
- **It fixes A's one ❌ by borrowing B.** The stack section ("{N} platforms will each report their own BFCM numbers") and the "What this can't see" section make it a slice of ASK BOSCO, not just a stock report. The stock analysis earns trust, and the stack section shows them the bigger problem. Together they lead to "which of these products actually make money after ad spend, by channel?", which is exactly what ASK BOSCO answers.
- **Truth risk is manageable.** Every figure is a count over public JSON with a timestamp. The copy rules for the build: say "missing core sizes", never "losing sales". Say "tagged", never "spending on". Show the method and the caveats in the report.

What I'm consciously giving up: B's "they couldn't have done this" moment (reading GTM) is kept, but as a supporting section. C's competitor angle is left for a later sequence step ("want to see how {competitor} looks on the same check?").
