# ContentScale Growth — CMS-independent handoff

**Goal:** Make a practical, copyable and downloadable SEO improvement package for any website, without forcing an external paid API or a specific CMS.

## Canonical workflow

1. Find the company and its **existing Tracker page**. The page URL and current source snapshot are the only mandatory technical prerequisites. GSC is valuable but **optional**; no data must be represented as `Needs access`, never as zero.
2. Complete editorial research using available public pages, existing Search Spy evidence, internal knowledge, client-verified details or manually verified comparisons. Label all factual claims **Verified**, **Observed**, or **Needs access** according to their source. Never invent rankings, projects, testimonials or arrival times.
3. From Growth Cockpit, choose **Download CMS-onafhankelijk Growth-opleverpakket**, or open `/growth/cms-handoff` as a signed-in ContentScale administrator. Choose the correct Tracker client and page.
4. Review the existing page, confirm the revision SHA and submit **approved content** with SEO title and meta description. For a `Verified` GSC claim, the exact page-query must exist in Tracker. An editor may use `Observed` or `Needs access` without a GSC connection.
5. Download the ZIP. It contains `manifest.json`, an implementation guide, editable Markdown copy, content HTML fragments, a metadata JSON file and an evidence-aware measurement plan.
6. Deliver the ZIP to the website owner or their CMS editor. For **Wix**, paste the text into native Wix text/heading elements and set title/description through Wix SEO settings. **Do not rely on an embedded iframe** for indexable content. For **WordPress**, use native blocks/Elementor appropriately. For Webflow/Squarespace/custom CMS, use their native content and SEO fields.
7. Keep the original canonical URL, heading structure, navigation, meaningful images, internal links and mobile presentation unless an explicitly reviewed change requires otherwise. No automatic publishing occurs.
8. Once published by the website owner, record the exact live URL and publication date and compare equivalent, non-overlapping GSC windows where available. GBP call-button actions are not connected telephone calls; sales and invoices must be separately substantiated.

## Free-core policy

**No paid third-party is required** to generate the package. Growth uses its own Node code and existing Tracker page source, with a native JavaScript ZIP writer. Optional GSC/GBP first-party integrations, AI visibility research, paid SERP providers and CMS connectors can increase evidence coverage or automation, but must never prevent a useful CMS-neutral manual handoff. No provider call is made when producing the package.

## Canonical interface

- Browser: `GET /growth/cms-handoff` — simple admin form, noindex.
- Admin source snapshot: `GET /api/growth/admin/pages/:pageId/cms-handoff/source?client_id=...`.
- Admin export: `POST /api/growth/admin/pages/:pageId/cms-handoff`, with `format:"zip"` for a download or `format:"json"` for integrations.
- Readiness: `GET /api/growth/admin/pages/:pageId/readiness?client_id=...` reports `cms_neutral` separately from the optional `wordpress_draft` readiness.

**Required before export:** authenticated administrator, exact canonical page and client, original source SHA, editor approval, useful reviewed text, metadata and an explicit evidence label. Active Case Studies and duplicate Tracker URL identities remain protected. No production website or customer database record is written by export.

## Status

This workflow is part of draft PR #93 until it is merged, database checks passed on the actual deployment target and browser downloads have been smoke-tested in an isolated environment. Synthetic route tests and CI do not substitute for a verified customer-site publication and measured search results.
