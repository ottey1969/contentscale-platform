# AI Citations Tracker — Brief Quality Layer

A validation + computation layer that makes the tracker's briefs **client-safe**: facts are computed in code, the LLM only narrates them. No invented numbers, no placeholders, no fabricated brand relationships, no junk-keyword plans, no duplicate/no-op recommendations.

## Files

| File | Purpose |
|------|---------|
| `brief-quality.js` | Core layer: GSC signals, cannibalization, keyword validity, data sufficiency, placeholder + fabrication guards, no-op/dedupe/collapse, `buildFactSheet`, `postProcessBrief`. |
| `gsc-client.js` | Google Search Console client: per-page metrics, the `query → page` matrix, cannibalization rows, token helpers. |
| `tracker-integration.js` | Reference wiring around your two Gemini calls (Citation Brief → `recommendations`, GSC Brief → `gsc_brief`). |
| `brief-quality.test.js` | 24 unit tests for the quality layer. |
| `gsc-client.test.js` | 5 tests for the GSC transforms (mock fetch — no network). |

Place all files next to `index.js` (repo root). Plain CommonJS — no build step.

## Requirements

- Node 18+ (uses global `fetch`). On older Node: `npm i node-fetch` and pass it as `fetchImpl`.
- `npm i google-auth-library` (only if you use the built-in token helpers).

## Install order

1. Drop the files in the repo root.
2. Run the tests first — they pass with zero config and prove the layer works:
   ```bash
   node brief-quality.test.js
   node gsc-client.test.js
   ```
3. Wire the `// >>> WIRE` lines in `tracker-integration.js` to your real fetchers + Gemini wrapper.
4. Add the GSC env vars (below) and connect `gsc-client.js`.

## Environment variables

```
# Service account (properties you own — grant the SA email access in GSC)
GSC_SERVICE_ACCOUNT_FILE=./sa.json

# OR OAuth2 (client-connected properties in your SaaS)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# refresh token is stored per connected client, not in env
```

## Quick start (the pipeline)

```js
const { buildFactSheet, postProcessBrief } = require('./brief-quality.js');
const { buildScanInputs, tokenFromServiceAccount } = require('./gsc-client.js');

async function scan(scanRow) {
  const token = await tokenFromServiceAccount(process.env.GSC_SERVICE_ACCOUNT_FILE);

  // 1. real GSC data -> exact cannibalization + metrics
  const inp = await buildScanInputs({
    siteUrl: scanRow.siteUrl,      // 'sc-domain:contentscale.site' or 'https://contentscale.site/'
    pageUrl: scanRow.url,
    keyword: scanRow.keyword,
    token,
  });

  const ctx = {
    gsc: inp.gsc,
    page: { url: scanRow.url, keyword: scanRow.keyword, html: scanRow.html,
            title: scanRow.title, h1: scanRow.h1, metaDescription: scanRow.metaDescription },
    site: { sitemap: scanRow.sitemap, gscQueryPages: inp.gscQueryPages },
    brand: scanRow.brand,          // { yearsInBusiness?, projectsCompleted?, serviceArea?, allowedClaims? }
  };

  // 2. compute the facts Gemini is allowed to use
  const facts = buildFactSheet(ctx);
  const header = `${facts.guardrails}\n\n--- VERIFIED CONTEXT ---\n${facts.contextBlock}\n--- END ---\n`;

  // 3. your two Gemini calls, with the header prepended to each prompt
  const rawCitation = await geminiCall(header + CITATION_TASK);
  const rawGsc      = await geminiCall(header + GSC_TASK);

  // 4. validate -> client-safe
  const citation = postProcessBrief(JSON.parse(rawCitation), ctx);
  const gsc      = postProcessBrief(JSON.parse(rawGsc), ctx);

  return {
    recommendations: citation.brief.recommendations,  // your existing column
    gsc_brief:       gsc.brief.recommendations,        // your existing column
    quality_report:  { citation: citation.report, gsc: gsc.report },
  };
}
```

## What the layer guarantees

1. **No fabricated relationships** — `scanForRiskyClaims` strips "successor to / replaced / acquired / powered by / partner of …" unless the exact phrase is in `brand.allowedClaims`. ("alternative to X" is allowed.)
2. **No junk-keyword plans** — `isValidKeyword` rejects navigational/stopword queries (about, home, contact …) and returns a "target a real keyword" recommendation instead (use `inp.suggestedKeyword`).
3. **No noise-driven alarms** — `assessDataSufficiency` flags < ~300 impressions as low-confidence; `computeGscSignals` only fires a CTR-gap when actual CTR is far below the expected CTR for the real position.
4. **No duplicate / empty / conflicting recs** — `dropNoOps` (empty action, replace-with-same), `dedupe`, and `collapseByTarget` (one rec per meta/title/H1).
5. **Cannibalization caught** — `detectCannibalization` uses the GSC `query → page` matrix when provided (`source:'gsc'`), else a sitemap heuristic.
6. **No placeholders** — `fillOrStripPlaceholders` fills `[X]`/`[Y]` from `brand` or removes the sentence.

Everything cleaned is logged in `report` (`riskyClaimsRemoved`, `droppedNoOps`, `collapsed`, `placeholdersRemoved`, `keywordValidity`, `dataSufficiency`, `cannibalization`) — surface this in your QA dashboard.

## Google Search Console setup (one-time)

1. Google Cloud Console → enable **Search Console API**.
2. Create a **service account** → in GSC, add its email as a user on each property. (For client properties in your SaaS, use **OAuth2** with a per-client refresh token.)
3. `npm i google-auth-library`.
4. `siteUrl`: domain property = `sc-domain:example.com`; URL-prefix = `https://example.com/`.
5. Scope is preset: `webmasters.readonly`. GSC data lags ~2–3 days (client defaults to the last 28 days with a 3-day margin).

## Tests / CI

Both suites are plain `node:assert` (no framework) and exit non-zero on failure.

`package.json`:
```json
{
  "scripts": {
    "test": "node brief-quality.test.js && node gsc-client.test.js"
  }
}
```

GitHub Actions (`.github/workflows/test.yml`):
```yaml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm test
```

Run the tests on every change to the Gemini prompt or the quality layer — they lock the behaviour so output quality can't silently regress.
