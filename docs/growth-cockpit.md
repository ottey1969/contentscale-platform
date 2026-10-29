# Growth Cockpit — how the system chooses and remembers

The Cockpit (`/track/:token/growth`) shows one **Start here** suggestion. The
rules are fixed and visible on the page; no industry or query is special-cased.

## 1. Every row gets a plain status

| Status | When | Suggested first? |
|---|---|---|
| Protected — do not change | Active Case Study on the page | Never |
| Page not found | `redirects_to` records a 404/410 | Never |
| Old address (redirect) | `redirects_to` holds a destination | Never — link to the final page instead; the redirect is kept |
| Just changed — wait | A publication was recorded less than 28 days ago | No |
| Skipped by you | Owner pressed "Skip" (reason saved) | No, until restored |
| Researched — no change needed | Growth research said `NO_CHANGE` | Not for 90 days, unless impressions double |
| Research blocked — retry later | Growth research said `DATA_BLOCKED` | Not for 7 days |
| Improvement found — not published | Research said `IMPROVE_EXISTING` / `NEW_DISTINCT_PAGE`, nothing published since | **Yes, first** (finish started work, up to 60 days) |
| Working — leave it | Top 3, has clicks, CTR ≥ 2% | No |
| Can be improved | Everything else | Yes, by score |

Score = impressions × position weight (1.5 for 1–20, 1 for 21–50, 0.35 beyond)
× 1.15 when the row has ≤ 2 clicks. Without query rows, saved page-level GSC
totals are used; without any GSC the Cockpit says it cannot rank demand.

## 2. What is remembered (server, table `tracker_growth_recommendations`)

* **Start** (owner link only): page, query, whether it was the system's first
  choice, and a snapshot of impressions/clicks/position taken from the server.
* **Skip / Restore** (owner link only) with an optional reason.
* **Research outcome**: the owner's complete Growth research run stores its
  final decision, blocker and evidence status for that page.
* Publications and before/after GSC windows stay in
  `tracker_growth_publications` / `tracker_growth_gsc_windows`; the Cockpit
  links them to the remembered suggestion to show "System's choices measured".

Viewing the Cockpit never writes. The table is additive (`CREATE TABLE IF NOT
EXISTS`) and never changes pages, Case Studies, GSC rows or redirects.
Measured differences are shown as observations, not as proof of causation.
