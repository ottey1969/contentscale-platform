# Growth — verified organic click breakthrough specification

Status: PROPOSED in draft PR #93 (not deployed). Date: 2026-10-16.
Pilot: https://contentscale.site/ homepage; later Perfect Roofing Team and CMS-independent customers.
Owner outcome: more **qualified organic clicks** to important pages, not impressions or vanity SEO scores.

## Measurement inputs
- Google Search Console Search Analytics via authorized property: date, page canonical, query (when available), device, country, search type, clicks, impressions, CTR and average position.
- Page revision history: canonical page ID, exact URL, published timestamp, changed title/H1/intro/CTA, semantic content hash, changed-by.
- Optional secondary source: consented phone-call or form leads, with provenance. Do not equate GA4 button events with booked business.
- Observed / Verified / Needs access labels and source/collected timestamp for every claim.
- If contentscale.site GSC is not connected, show **Needs access**; do not substitute another customer's property or use screenshots as an API feed.

## Baseline / change point
1. Register homepage change date as a discrete intervention, not the first day in a long reporting range.
2. Default pre-change 28 complete days vs post-change 28 complete days. Show post-change coverage count; do not call an incomplete 28-day window conclusive.
3. Exclude freshest ~3 days from settled Search Console comparisons when data is incomplete; show provisional daily values separately.
4. Compare like-for-like weekday mixes using 7-day rolling sum or daily average; make the exact date boundaries visible.
5. Show query clusters: branded vs nonbranded, commercial vs informational intent, and primary geographic/device segments. No claim of incremental business traffic from branded-only lifts.
6. Separate seasonal variation, promotion effects, Google reporting delays, position mix and pre-existing trajectory from a content intervention.

## Click breakthrough gate
- Watch an *absolute clicks* benchmark: user-marked red horizontal level from screenshot is visual only until its daily numeric value and date window are identified from GSC; never convert pixel height into a metric.
- Candidate breakthrough: >=7 consecutive **settled** days whose trailing 7-day average is above the pre-change trailing-28-day mean, AND post-change click average >= 15% above pre-change baseline.
- Confirmed breakthrough: at least 28 settled post-change days, positive growth in nonbranded intent-relevant clicks, and the post-28-day average at least 15% above pre-28-day average. No day alone qualifies.
- Store confidence as provisional/confirmed, not a causal attribution. Report absolute lift (clicks/day) and relative lift (%) alongside impressions and CTR. Describe whether growth stems from more appearances, improved CTR, or query-mix change.
- Use 28-day and 7-day chart series; do not smooth or hide the raw daily click series. Zero and unknown are distinct.

## Growth next action
- If impressions rise but clicks lag: evaluate query-to-title/snippet match, above-fold offer, rich-result eligibility and CTR by position bucket; keep top-performing URL sections intact.
- If nonbranded clicks rise but leads do not: inspect lander CTA, phone and form deliverability and exact entry-page intent.
- If clicks spike for <=3 days: mark volatile and monitor; no content rewrite based only on the peak.
- If ranking strong with flat clicks: identify new commercial queries and related supporting pages, avoiding cannibalization.
- For Wix or other CMS: deliver independent JSON + HTML/CSS copy-ready handoff, URL map, QA contract, and verified before/after GSC dataset; WordPress connector is an optional adapter.

## QA examples
- One 55-click day after 20-click days: **not** breakthrough.
- 28 settled days with 20% increase but no nonbranded gains: **not confirmed**; explain branded attribution.
- Confirmed elevated 28-day nonbranded clicks and stable/lower impressions: valid click gain from improved CTR, subject to intent and tracking checks.
- Missing current GSC access: status Needs access, no "Growth succeeded" claim.
