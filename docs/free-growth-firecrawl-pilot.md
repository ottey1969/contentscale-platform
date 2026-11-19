# Free Growth: hosted Firecrawl pilot

Status: **opt-in, Free Growth only**. This pilot does not alter Tracker Growth or Pre-Write.

## Railway environment variables

- `FIRECRAWL_API_KEY`: Firecrawl API token; set it as a private Railway variable, never commit it.
- `FREE_GROWTH_FIRECRAWL_ENABLED=true`: activates the Free Growth reader pilot.

Both are required. Without them Free Growth keeps its existing HTTPS research reader.

## What changes

The Free Growth research engine (`src/growth-free/engine.cjs`) opts into a run-scoped hosted Firecrawl reader. It preserves existing public-HTTPS reads, respects a target site's explicit 401/403/406/429 refusal, then requests Firecrawl HTML of already-discovered public pages. Both results use the same existing editorial/quality gates. Firecrawl is NOT a ranking or AI citation measurement service; Serper still supplies the Google ranking URLs.

- Up to **six** unique Firecrawl scrape attempts per research run.
- The API is contacted only server-side; no SDK installation or new WordPress plugin.
- Duplicate URLs share their Firecrawl request for the run.
- Empty, significantly less complete, timed-out, or failed Firecrawl responses fall back to the pre-existing reader.
- Each Free Growth result includes a collapsed **Page reading** status (used/attempted/fallback) and its downloadable JSON report contains `research_reader`.
- Report labels are operational diagnostics, not proof that ranking or AI results improved.
- Original source URLs and page-content eligibility gates remain in place.

## Test

Run: `node --test tests/growth-free-firecrawl-pilot.test.cjs`.

## Free Growth acceptance checklist

1. Deploy branch in an isolated environment with `FREE_GROWTH_FIRECRAWL_ENABLED=true` and the private `FIRECRAWL_API_KEY`.
2. Start a **fresh** Free Growth check on a public existing page, with the full customer question and selected market.
3. Open result -> **Page reading · Firecrawl pilot**; check attempted/used/fallback and download JSON.
4. Verify competitor URLs match the Google results, direct page capture and editorial decision are grounded, and no AI citations are attributed to Firecrawl.
5. Repeat with a non-Firecrawl environment to compare source coverage, readability and recommendations.
6. Verify the form, writing and publish workflow still work and that Tracker Growth's output has not changed.
7. If credits are exhausted, verify the result still finishes using the old reader.

**Production rollout:** pilot is disabled by default. Do not merge/deploy to production until CI is green and a manual Free Growth end-to-end check has been reviewed. Tracker Growth should be adopted in a separate PR only after the pilot proves value.
