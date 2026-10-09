# ContentScale — staging phase 2 (read-only Tracker contract checks)

Target branch: tracker-staging. This is an additive-only staging package.

## What this tests
- Re-runs the ORIGINAL staging preflight (correct empty schema, 24 tables / 496 columns / 23 foreign keys / 53 indexes).
- Compiles four SELECT query shapes against the canonical Tracker client/page/snapshot/case-study and workflow-event tables.
- All checks run with REPEATABLE READ READ ONLY; query-shape tests use EXPLAIN WITHOUT ANALYZE and are rolled back.
- No app import; no migrations, writes, email, AI calls, scans, worker, or publishing.
- HTTP only exposes cached status at /__staging/health and /__staging/tracker/contracts.
- Returns 404 for all other paths/methods, including normal Tracker/CRM API routes.

## Important limitation
This is NOT a functional Tracker runtime. It validates database relationships and readiness only. It does not exercise a real user journey or prove the safety of starting the very large production app. No duplicate business logic is introduced.

## Deploy sequence (human-approved)
1. Commit/add the two src/staging files to tracker-staging. DO NOT change Railway's start command yet. It stays node src/staging/preflight-server.cjs so the existing preflight remains safe after autodeploy.
2. Review/confirm the live GitHub branch and Railway staging deployment commit.
3. Locally test with node --test tests/staging-tracker-readonly.test.cjs in the existing repository.
4. When ready for next verification stage ONLY, update Railway staging Custom Start Command to node src/staging/tracker-readonly-server.cjs (never production).
5. Verify staging-domain/__staging/health status is tracker_contracts_verified_only and /__staging/tracker/contracts shows all four verified checks.
6. If any check fails, restore the original start command immediately and inspect Railway logs. Do not bypass the gate.

Do not change CS_STAGING_ISOLATED_DB_CONFIRMED=0, CS_STAGING_SIDE_EFFECTS_DISABLED=0, or CS_STAGING_APP_BOOT_APPROVED; the original preflight gate intentionally requires the unapproved state.

## Following phase
Only after reviewing the complete boot-time side effects and canonical entity/state transitions, implement a separately approved isolated functional test with synthetic data. Never point this at the production Neon project.
