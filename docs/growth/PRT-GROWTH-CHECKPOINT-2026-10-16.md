# PRT Growth checkpoint — 16 October 2026

Status: **PAUSED live PRT SEO/WordPress/GBP changes. Resume after ContentScale Tracker Growth is completed and tested.**
Repository: ottey1969/contentscale-platform. This checkpoint is deliberately on a separate Growth branch, **not deployed**.

## Goal / strict guardrails
Measure commercial rankings -> qualified organic clicks -> phone/form inquiries -> jobs/revenue, not raw impressions or content scores. Do not invent completed roofing projects, time-to-arrival guarantees, fake authority or reviews. Do not generate 21 near-duplicate NJ location pages. Don't shorten a ranking page blindly; protect current design, Elementor images, templates, internal links, existing functionality and Case Studies. Never auto-publish.

## GSC verified baseline (Windsor.ai, property sc-domain:perfectroofingteam.com)
- Page: https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/ — WordPress ID **3269**.
- Query/page-scope, **2026-07-15 to 2026-10-12**: **4,879 impressions, 0 clicks, 101 query rows**.
- `emergency roof repair nj` 776 impressions, position 42.39; `24 hour emergency roof repair nj` 545 impressions, pos 32.08; `emergency roof repair hudson county` 464 impressions, pos 47.28; all 0 clicks.
- Page-dimension comparison, HTTPS URLs, **2026-08-18—09-14: 17,822 impressions/1 click** and **2026-09-15—10-12: 7,435 impressions/2 clicks**; dimensional reports yield different totals. Preserve source, time range and granularity. The impression decline predates Sep 24; don't assign cause without evidence.
- Historical `http://www.perfectroofingteam.com/` GSC row has unusually high positions while homepage/county URLs are lower; examine canonicalization/redirect and attribution before concluding it is a ranking win.
- An automation was scheduled for **2026-10-30** for the first follow-up and 14-day comparison; use 30/60-day comparisons after.

## Google Business Profile (Windsor.ai connected)
- Account location `locations/15643012111140261384`; listed name Perfect Roofing Team LLC - Roofing Contractor NJ; registered office **380 Garibaldi Ave, Lodi, NJ 07644** and phone **(862) 238-6353**.
- The company **started in Garfield**; Garfield address was historical, not a second active branch. External BuildZoom listings have conflicting Garfield/Lodi representations and need verification/correction without deleting valid old licenses.
- Primary category roofing contractor; **19 Google reviews (5/5)**; about 161 media records and 72 posts since January.
- Sep 2026 GBP: **226 Search/Maps views**, **4 call clicks**, **5 website clicks**, **48 direction requests**. These are interactions, not confirmed sales.
- On 2026-10-15 profile website changed to **https://perfectroofingteam.com/** (was http/www) and profile description updated to the Lodi base, realistic 24/7 emergency phone coverage, roofing services, Bergen/Hudson/Passaic/Sussex. Windsor.ai readback verified.
- GBP includes NJ and Bergen/Hudson/Sussex/Passaic service areas; public website also advertises 21 NJ counties. Local pages should be based on factual service coverage.

## Live WordPress/Elementor edits already done and verified
- **ID 3269**, emergency roofing: 7 broken TOC anchor IDs corrected; Bergen/Hudson section + internal county links + call CTA added.
- **ID 2204**, Bergen: new practical repair-versus-replace, storm/inspection section; orphan source removed; previously empty H2 filled; statistics refined with named III source and correct description of national data; page retains original 3 distinct content images.
- **ID 2232**, Hudson: useful local roofing steps, existing links and click CTA; duplicate image removed while primary remains; unsupported 2–4-hour arrival wording removed, including embedded JSON-LD; two unverifiable Jersey City/Hoboken 'case studies' were replaced with **clearly illustrative** technical scenarios, not claimed PRT jobs.
- Elementor renders content from `_elementor_data`; edits to `post_content` can be invisible.
- Known technical debt: both county Elementor HTML widgets embed a duplicate `<!DOCTYPE html><html><head>...` inside WP HTML. Requires preservation-safe template/metadata/schema cleanup. Bergen mobile Lighthouse shallow SEO 100/100, accessibility 89/100 (contrast, heading order, links, main landmark, accessible names); SEO score is NOT evidence of rankings.
- WPVibe Free daily cap temporarily reached on 2026-10-15; don't claim further live verification until connection/tool allows.

## Actual revenue, attribution limits
- Owner reported invoices **USD 5,000 previous month** and **USD 12,000 current month**; these are *invoices*, not paid revenue or proof of SEO-sourced jobs. Zero clicks on *one* organic page does not mean no customers or projects.
- PRT pages contain GA4 measurement `G-NK7S1X1NCB` but GA4 **not connected** in Windsor.ai at pause. Validate phone/form conversion events and privacy-safe job attribution before claiming SEO uplift.
- The owner may later give anonymized completed-job city and type with original photos; do not block useful draft quality on missing private project evidence, and do not invent it.

## Growth in Tracker — acceptance criteria for resumption
1. Determine actual deployed Railway commit, canonical branches, and merged state. Growth PR #35 **merged on 2026-10-12**; its source code alone is not proof of the live end-to-end flow.
2. Ground opportunity proposals on page-scoped GSC data, exact time windows/dimensions, Search Spy competitor/page evidence, AI Spy evidence; distinguish missing, 0 results, and unsupported claims.
3. Built-in Growth → evidence → prioritized commercial query → unique edit plan -> quality gate -> **protected WordPress draft preserving original template, images and design** -> rendered review and user approval -> publication with original URL/canonical -> before/after experiment record.
4. Fail closed on duplicate images, 4-image stacks, empty headings, dangling sources, fabricated case studies, incorrect metadata/links, template mismatches, unsupported claims; provide deterministic repair/missing-only completion, not blind rewrite.
5. User-focused one clear next action, verified status, 14/30/60-day outcome tracking with separate GSC/GBP/GA4/job metrics. No silent changes to existing Case Studies or Network acquisition.
6. Build tests for real Elementor original-page roundtrip, PRT source data, counterexamples and end-to-end CRM/Tracker/WordPress workflow, validate staging, then controlled production release.

**Next work:** Finish Growth **inside** ContentScale Tracker. Leave PRT live optimization paused until this workflow is verified.

## Tracker Growth build status
Growth PR #93 contains the next read-only client opportunity brief, GSC window comparisons, stronger editorial checks, template-safe draft assembly and page/post draft transport. Growth-specific tests and disposable PostgreSQL migration tests passed. The complete legacy CI still reports an independent Network test failure. No deployment or live PRT modifications were made after the pause; a real staging-to-WordPress end-to-end verification remains required.

## 16 October integration results
- The Network Acquisition Journey, general test suite and full Growth Evidence and Render Gate are all green on Growth draft PR #93.
- The shared 30/day day-nine sender warm-up policy, verified-only invitations, noindex acquisition page and unsent invitation preview assertions were reconciled in tests.
- Both additive Growth tables exist in a separate isolated Neon integration branch; the exact-page GSC history table was additionally verified on a migration-preview branch with synthetic records. Neither was applied to the parent staging or the Railway production database.
- Elementor draft protection can now: verify exact original builder JSON, apply approved single-widget changes without changing original IDs/images/stylesheet, require a fresh source + Case Study check, create a new unpublished draft and verify Elementor metadata readback through a caller-supplied WordPress meta bridge. Synthetic cross-module end-to-end contract is green.
- **Remaining real-world launch blockers:** the ContentScale application has no verified WordPress Application Password connection for PRT in its current Railway environment; a real Elementor-capable draft metadata bridge has not been verified against a customer WordPress site; migration promotion to the parent database requires specific approval; no live production deploy occurred. Do not represent the synthetic E2E tests as a successful customer-site publishing integration.

## October 16 — Invoice vs work attribution safeguard
User provided a forwarded PRT invoice conversation. An issued USD 12,000 invoice for roofing work included a customer question about chimney flashing and an answer that it was included in the quoted price. **This only establishes that an invoice and customer pricing discussion exist. It does NOT verify acceptance, work completion, payment or Google SEO acquisition.** Do not store or publish the customer's name, email, invoice number or invoice contents in the Tracker. The invoice template also shows a business-name spelling variant, third-party invoice sender and a separate cleaning-domain contact address; recommend verifying consistency before client-facing claims.

- Owner communication: clarify whether "no work" means too few *new inquiries* or too few *confirmed jobs*; ask separately whether the invoice is approved/completed/paid and where the inquiry came from.
- Growth now includes a private company-level commercial event ledger (new additive migration) that stores ONLY stage/channel/observed date + generated opaque ID, and treats manual owner statements as unverified.
- Never equate zero Search Console clicks on one landing page to zero jobs company-wide.
- No dollar amounts, invoice numbers, customer names, email addresses or service addresses are included in client-facing reports or the commercial event schema.
- This module is implemented in draft PR #93, validated in synthetic regression tests and on isolated Neon test branch, and **is not yet a production feature**.
