# ContentScale: canonical prospect E2E release gates

Canonical flow: **CEO → QuickScan → Audit (up to 20 qualified pages) → Tracker → Case Study**.

## Environments (verified 2026-10-11)
- Production: Railway `fabulous-determination / contentscale-platform`, repository `ottey1969/contentscale-platform` on `main`, explicit startup `node src/index.js`.
- Existing staging: Railway `contentscale-tracker-staging / hospitable-flow`, branch `case-study-scanner-safety-candidate`, explicit startup `node src/staging/tracker-readonly-server.cjs`. This is intentionally a **read-only contracts diagnostic**, and **cannot** exercise a complete write-based flow.
- Never point a writable staging application at the production database. Never enable providers, schedulers or e-mails on existing read-only staging.

## User journey (one identity, one state machine)
1. **CEO**: choose a prospect or existing company; persist canonical company ID and website; one clearly labeled CTA to QuickScan.
2. **QuickScan**: use homepage and relevant eligible pages; explain why any URL was excluded; never include privacy policy, disclaimer, terms, cookie, auth, sitemap/feed/robots, duplicates, empty product pages or unindexable pages. Preserve provenance and timestamps.
3. **Audit (max 20)**: promotion requires customer interest; reuse canonical company and good scan evidence where valid; select no more than 20 UNIQUE eligible URLs; fewer than 20 is valid if site has fewer. Never pad with legal/empty pages.
4. **Tracker**: promote existing selected qualified pages (no duplicate clients or pages); retain GRAAF scores, metric timestamps, evidence source and verification status. Retries must be idempotent.
5. **Case Study**: require existing validated Tracker page and a persisted baseline, original URL, capture source and metric timestamps. Re-scan only when actually eligible. Legacy schema-version-1 and existing `es.contentscale.site` case studies must be tested explicitly.
6. **UI**: only one appropriate next CTA; unavailable actions disabled with reason; request progress; user-readable errors; reload and back navigation do not lose state or cause duplicate work.

## Automated acceptance scenarios to implement on isolated DB
| Test | Invariant |
| --- | --- |
| new prospect to QuickScan | same company ID across screens; no duplicate entity |
| existing prospect to QuickScan | existing result reused when valid |
| site with privacy/legal/disclaimer | none selected for commercial scans |
| empty or thin product page | rejected with meaningful reason |
| site with fewer than 20 good pages | audit succeeds with actual eligible count |
| site with more than 20 | audit capped at 20 unique qualified pages |
| timeout/partial/cancel/retry | no phantom state, duplicate page, or repeated email |
| approval of Audit | requires explicit recorded interest |
| promote Audit to Tracker | existing page/identity reused |
| Case Study activate/rescan | baseline retained, new metric/history added |
| legacy Case Study migration/refresh | does not lose original URL or baseline |
| role tests | prospects cannot reach admin-only actions |
| reload + back | latest durable state and next CTA remains correct |
| production deploy | actual running commit and safe GET smoke tests checked |

## Evidence required to say 'working'
For each stage: endpoint/route + relevant handler, state transition, DB before/after, UI next action, success path AND representative error path, test result. A green deploy or HTTP 200 alone does not satisfy this release gate.

## Known production findings (2026-10-11)
- Tracker scans ran successfully for `es.contentscale.site/` and an NL GEO page, producing scores and persisted briefs.
- `brief-action/resolve` returned HTTP 409 for some calls and HTTP 200 for later calls; investigate context before treating as defect.
- `/ai/linkedin-strategy` returned repeated HTTP 500 responses; separate reliability incident.
- Existing staging reports it did **not** boot the app or perform writable workflows.

## Change safeguards
- Read running source/build before changes; compare `src/index.js`, `src/network/register-network.js` and actual Railway start command.
- Minimal additive changes, tests first, no new parallel company table/state engine.
- Inspect upstream/downstream impact (CRM, email, legacy records, roles, timestamps, re-scan) before merge.
- Use dedicated writable staging with synthetic data only; retain read-only staging as-is.
- Do not deploy unfinished work to production or claim full E2E success based on contracts-only checks.
