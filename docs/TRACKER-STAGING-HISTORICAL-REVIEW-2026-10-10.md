# ContentScale Tracker staging — historical evidence and release hold

**Review recorded:** 2026-10-10. **Status: HOLD.** This file documents
read-only evidence observed in the Neon SQL Editor and source/CI inspections.
It is not permission to deploy, mutate production data, or start the full app.

## Strict environment identity

- **Actual production Neon project:** `leaderboard-contentscore`; branch `production`; database `neondb`.
- **Isolated test Neon project:** `contentscale-tracker-staging`; branch also called `production`; database also called `neondb`.
- The branch name `production` and database name `neondb` are **not sufficient** to distinguish the two Neon projects.
- Existing staging diagnostic entrypoint: `src/staging/tracker-readonly-server.cjs`. This must remain diagnostic-only.

## Manual read-only production SQL audit (user-supplied result)

Counts observed at the time of review:

| Indicator | Count |
|---|---:|
| All production Tracker pages | 203 |
| All production Tracker case studies | 20 |
| Missing case-study client links | 0 |
| Missing case-study page links | 0 |
| Cross-client page links | 0 |
| Implementation verification before baseline | 0 |
| Completed flag without timestamp | 0 |
| Completion timestamp without flag | 0 |
| Perfect Roofing Team Tracker pages | 69 |
| Perfect Roofing Team case studies | 13 |
| Unique PRT pages with a case study | 13 |
| PRT pages with multiple case-study records | 0 |
| PRT case-study records without a page | 0 |
| PRT cases with an empty baseline object | 0 |

PRT historical classification:
- 12 of 13 case-study pages have `is_active=true`; one historic page (Tracker page 2282,
  case study 1018) has `is_active=false`. No live 301 response was independently verified.
- Case study 1018 is baseline `schema_version=3`, with non-empty `ai_evidence`,
  HTML source and HTML capture timestamp. Preserve it as history.
- Active case study 1 is baseline `schema_version=1`. It lacks `html_source`,
  `html_captured_at`, and `metric_snapshot_at`; **do not backfill** these historical
  values from today's webpage or metrics.
- All 13 records have the `ai_evidence` key, but key presence or a non-empty JSON object
  does **not** verify the accuracy of AI-engine citation/recommendation classification.
- "Tracker Action Pages · 12" is a UI filter (monitored / waiting / active-cycle / attention),
  not the database's 69-page total or the complete set of 13 historical case studies.

## Source inspections and tests

- The canonical case-study GET in `src/index.js` returns the saved
  `baseline_data` without a mutation-on-read. Synthetic v1 and v3 canonical-handler
  tests show no backfilling of missing timestamps/HTML and no cross-owner read.
- Staging's first-statement fail-closed boot guards are still present in
  `src/index.js` and `index.js`.
- A staging-only defense-in-depth quarantine now suppresses 2 `createAllTables`
  scheduling call sites, both timed CEO follow-up email invocations, and
  the eager Network import. Non-staging source behavior is unchanged at those sites.
- A second strictly staging-only quarantine also covers automatic Tracker profile
  assignment, meta-intelligence schema ALTER at startup, initial Gemini model probing,
  automatic abandoned-research updates, resumed batch jobs, Otto session migrations
  and cleanup, bulk-job startup status repair, bulk worker registration, contact
  intelligence worker resume, Tracker scheduled scans, and Boost session auto-close.
  Each was guarded at its existing canonical callsite rather than creating duplicate
  workflow logic. The complete full-app side-effect inventory is **still unfinished**.
  **Neither quarantine permits the full application to start.**
- Staging Nixpacks is the current builder. The inactive Dockerfile references
  `src/server.js`, which is not present in the repository. Do not switch builders
  without resolving that mismatch.

## Unresolved — release remains blocked

1. Complete an evidence *content* reconciliation of the historic PRT AI classifications;
   do not silently promote mentions/local map appearances to domain/exact-page citations.
2. Inventory and enforce fail-closed behavior for **all** startup side effects, including
   additional database writes, periodic jobs, email providers, AI calls, scans, publishing,
   webhooks and import-time module effects.
3. Confirm staging cannot connect to production Neon even if a URL is misconfigured;
   staged schema/count guards currently fail closed on non-empty or unexpected schema.
4. Exercise complete canonical journeys against disposable **synthetic** staging data
   with rollback, then explicitly review whether isolated full-app boot is appropriate.
5. Never infer production release authorization from successful isolated tests.

**Do not modify real production Tracker baselines, merge the staging branch to
`main`, or change Railway's diagnostic start command under this review.**
