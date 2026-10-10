# Tracker staging — Case Study scan eligibility regressions (2026-10-10)

**Scope:** source/runtime investigation and acceptance criteria only. No production or historical data changes. Full-app boot and release remain HOLD.

## Reported incidents (unverified database states)

- `es.contentscale.site`: interface displays last scan 2026-08-18, GSC page metrics, AI checked 0/5, Monitoring Off, Case Study waiting for baseline, and "waiting for next scan opportunity". A past scan is *not* proof of a complete case-study baseline.
- `es.contentscale.site.consultor-geo` (user-provided label; confirm canonical exact URL/page identity before lookup): Case Study reportedly activated 2026-10-10, yet scan unavailable. We have not established whether the cause is a cooldown, queue/lock, user permission, missing evidence, scheduler, or UI eligibility mismatch.

## Required canonical distinctions

1. `case_study_activation`: explicit intent and current study lifecycle; never infer completion from activation alone.
2. `baseline_readiness`: per-page evidence requirements and captured-at times; GSC, HTML/page scan, AI checks etc. independently identified as complete/missing/not-applicable.
3. `manual_scan_eligibility`: action-specific authenticated permission plus safety/lock/cooldown; independent of automatic monitoring toggle.
4. `automatic_monitoring`: recurring schedule only, not a blanket manual-scan prohibition.
5. `scan_job`: queued/running/succeeded/failed with persisted job identity, timestamp and idempotency.
6. `historical_baseline`: immutable original snapshot; subsequent scans generate new dated evidence rather than overwriting history.
7. `verified_facts`: can await the next permitted scan without making a separate Case Study baseline action unreachable.

## Required decision precedence (for existing canonical resolver, not new parallel state store)

- If user cannot access page/client: deny without revealing private data.
- If scan job queued/running: show job progress; disable duplicate start.
- If blocked by a real cooldown/lock: show exact reason, next eligible timestamp if stored, and safe retry behavior.
- If baseline is incomplete and an evidence-fetch action is available: show that action; only mark Case Study ready when all required evidence is saved.
- If baseline requires scan and manual scan is permitted: show the manual scan action even when Monitoring Off.
- If an external dependency is missing: show which dependency and how to resolve it; no fake "next scan opportunity".
- When awaiting periodic scan by actual policy: show the scheduled timestamp, not an indefinite waiting label.

## Repro/verification checklist (synthetic staging only)

A. Older scan + GSC metrics, 0/5 AI checks, no complete baseline, Monitoring Off: explain exact remaining evidence and present permitted next action.
B. Newly activated Case Study + Monitoring Off + manual-scan eligible: offer scan regardless of monitoring setting.
C. Newly activated Case Study + queued scan: show queued job and refuse duplicate submission.
D. Newly activated Case Study + provider/permission/cooldown block: show actual block reason, no false ready or endless waiting.
E. Refresh/reload: same persisted states and next action.
F. Legacy baseline v1 without capture timestamps: do not synthesize/backfill timestamps from current visits.
G. Other client's page ID: deny; never fetch/attach another client's page data.
H. Subsequent scan: append dated evidence without altering original baseline, and avoid duplicate jobs on retries.

## Root-cause evidence required before implementation

- Verify exact canonical page identifier and client association for both incidents.
- Trace `POST .../case-study/start`, `POST .../baseline-gsc`, scan-eligibility resolver, manual scan route and UI disable/wait badges end-to-end.
- Inspect stored last-scan timestamp, `next_check_at` or equivalent, monitoring flag, queued/running job, case-study baseline JSON, and evidence timestamps.
- Compare response from initial request and reload.
- Patch existing canonical workflow only; no second state machine. Provide runnable DB-backed tests before promotion.

**Non-goal:** automatically initiating scans, bypassing account limits/cooldowns, toggling monitoring, or editing live records based on screenshot alone.
