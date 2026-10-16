# Growth — Informational intent to qualified sales conversion

Status: product specification / draft only, not deployed. October 16, 2026.

## Core principle
Keep the original informational question completely answered. Add a truthful, query-relevant next step for visitors who want personalized help. Growth success is qualified opportunities and real sales, not CTA impressions or button clicks.

## Intent mapping
- Information seeking: how/what/why/comparison. Primary UX = answer. Secondary UX = relevant service diagnostic or personalized tool.
- Problem-aware: symptoms, common errors, process. CTA = check my website / find gaps.
- Solution-aware: best approach/provider/options. CTA = see deliverables or consult.
- Transactional: consultant, audit, pricing, hiring. CTA = consultation and intake.

## ContentScale exemplar: AEO vs GEO vs SEO
Visitor wants an explanation and side-by-side differences. Do not replace or bury the original article with a pitch.
After the key comparison, offer contextual CTA:
'Want to know how these differences affect your own website? Run a quick visibility check.'
At the end, offer qualified expert service:
'Get a prioritized technical SEO and AI search improvement plan for your website.'
Avoid guaranteeing rankings, AI citations, impressions or leads.
Link to a real working scan flow, or label the interaction as unavailable; never send traffic to a broken or unrelated CTA.

## Decision model
For each page, create 1 primary contextual CTA and up to 1 secondary commercial CTA:
- query/intent cluster & main page promise
- CTA placement relative to answer (never interrupt before answer)
- offer, destination URL, actual product/service availability, promise proof
- CTA click event with page ID, CTA ID, variant
- scan started, scan completed, qualified lead submitted, meeting booked, sale won (only when evidence exists)
- metric denominators: organic sessions -> CTA clicks -> scans -> qualified leads -> customers
- channel segmented (organic branded/nonbranded, paid separately) and attribution caveats
- avoid double-counting repeated form submissions and session noise

## Growth experiment
Compare an observed baseline with an after window; one page and CTA hypothesis at a time. Preserve high-performing information and test subtle contextual position/copy, not wholesale rewrite. Only declare revenue impact if qualified leads or sales can be independently confirmed. If the user lacks CRM/lead data show 'unknown', not 0.

## Handoff
All recommendations must generate CMS-neutral CTA copy, semantic HTML, minimal scoped CSS, tracking requirements, destination map, and WordPress/Elementor + Wix implementation notes; do not depend on one vendor or paid third party.

## QA gates
- Information-first answer remains intact.
- CTA offer is relevant to exact query and visitor's problem.
- Page not cluttered with multiple competing CTAs.
- CTA destination loads and is usable on mobile.
- Real conversion or lead verification; do not assume button clicks are sales.
- Every claim is observed, verified or needs access.
