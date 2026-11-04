# ContentScale Canonical Architecture Migration

Goal: `src/index.js` stops being rewritten at build time. Each function moves behind a module that `src/index.js`
calls directly, one functional boundary at a time. The Tracker, Growth and the Pre-Write Brief are not rebuilt, and
routes, tables and saved formats stay the same.

## Rules for each step

- First connect the module directly, prove equal behaviour, and only then remove the build patch.
- Reference tests compare the module with the frozen legacy code on the same inputs. A difference fails the test, and the
  test says what differs.
- A staging check boots the full canonical server against a disposable PostgreSQL, with outside network access denied.
- No Neon tables or client data are removed, no Tracker is regenerated, GSC stays optional, and Serper stays the only
  search provider.
- Production changes only through the normal Railway deploy of `main`, after CI is green.

## Phase 1 — inventory (main `d589467`)

`npm run build` and the Dockerfile run `scripts/prepare-canonical-production.cjs`, which rewrote `src/index.js` with
five patches:

| Patch | What it rewrites | Status |
|---|---|---|
| `patch-prewrite-ai-answer-research.cjs` | Pre-Write Brief: 25 texts (labels, prompts), 3 code insertions (research for the request, saved with the Brief, refresh after Complete missing only), script tags with a content version | **Migrated** (this step) |
| `fix-audit20-inline-label.cjs` | One malformed Audit 20 CTA label, in every template that has it | Open: a text fix, can go straight into the source |
| `fix-ceo-domain-validation.cjs` | Stricter CEO domain check, server side | Open |
| `fix-ceo-form-validation.cjs` | `isCeoDomainInput` helper in the public and admin CEO forms | Open |
| `repair-canonical-browser.cjs` | Replaces the inline Puppeteer launcher with `src/browser-manager.cjs` and a CEO error contract | Open: already a module, only the call site still needs to move |

Patches outside the production build:

- **Release gates only.** `release-canonical-boot.yml` and `release-canonical-funnel.yml` run
  `patch-audit20-content-verification`, `patch-audit20-ready-state`, `patch-tracker-interest-idempotency` and
  `patch-audit20-interest-idempotency` in CI before an isolated boot. On the current source, three of them report
  "already patched". `patch-audit20-content-verification` still changes the source. Its gate is therefore not in the
  production build, which needs a separate decision.
- **Not wired anywhere.** Other `scripts/patch-*.cjs` files (case study, growth, tracker) are referenced by no build or
  workflow. They are historical.

## Phase 2–4 — Pre-Write Brief (done in this step)

- `src/prewrite-brief-research.cjs` is the server side of the research:
  - `researchForRequest` builds the research for a new Brief request;
  - `attachToBrief` saves it with the Brief;
  - `refreshAfterMissingOnly` rebuilds it after Complete missing only;
  - `scriptTags` gives the versioned script URLs, computed when the server starts.
- `public/prewrite-ai-answer-research.js` is unchanged. It is still the single prompt builder for the browser and the
  server.
- `src/index.js` holds the final texts and calls the module. The build no longer touches any Pre-Write line.
- Reference tests:
  - `tests/fixtures/prewrite-legacy-inline-d589467.cjs` freezes the code the patch inserted;
  - `tests/prewrite-brief-research-migration.test.cjs` runs it next to the module. It covers 6 request cases (5, 3 and 0
    answers, automatic Perplexity, missing keyword, long answers with unsafe URLs, Turkish market) and 7 Complete
    missing only cases;
  - mutation checks confirmed that changed labels, language priority, the clip limit and evidence preservation are
    detected.
- Byte comparison:
  - the old and new canonical builds differ only in the four code places and the module `require`;
  - on a booted server, the Tracker page and both scripts were byte-identical between the old and new build.
- Staging check: `tests/prewrite-brief-research-e2e.test.cjs`, which runs in CI with PostgreSQL. It covers the Tracker
  page, Complete missing only through the real API, and reopening the saved Brief.
- Two intended differences:
  - when the refresh after Complete missing only fails, the old code swallowed the error silently; the module also logs
    it, and in both versions the completion itself continues;
  - if a Research Prompt tab script is missing from `public/`, the old build failed; now the server still starts, logs
    the error and leaves only the tab out, so the rest of the platform is not affected.

Not verifiable from CI: a real generation run with Gemini and Serper, and the Railway deploy itself.

## Next boundaries

1. `repair-canonical-browser`: move the call site into the source; the module already exists.
2. The CEO domain and form validation: move into one shared validator module.
3. The Audit 20 label: a text fix in the source.
4. Then `prepare-canonical-production.cjs` only verifies; it no longer rewrites.
