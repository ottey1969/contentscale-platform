# Pre-Write Brief + Rank Tracker — canonical end-to-end contract

Date: 2026-11-14. Scope: source and CI-level verification, isolated PostgreSQL/browser E2E and live deployment check; **not** a claim that a paid customer's real answers or emails were sent.

## One source of truth per stage

| Stage | Owner/source of truth | Required integrity check | Exercised by |
| --- | --- | --- | --- |
| Keyword, market, language, question | Pre-Write modal + validated server request | Exact selected question, region, language; source of Google's answer explicitly identified | `prewrite-research-tab-browser.test.cjs`, `prewrite-ai-answer-integration.test.cjs` |
| Five AI answers | `prewrite-ai-answer-research.js` shared in browser + server | Echo/prompt text is invalid; manual origin is unverified; missing engines remain missing; research is pre-publication, **not citation monitoring** | `prewrite-ai-answer-validation.test.cjs`, `prewrite-research-prompt-contract.test.cjs` |
| Brief generation | Stored `prewrite_briefs` and `prewrite_async_jobs` | Research prompt visible and matches canonical builder; generation/quality gate can say NOT PASSED | `prewrite-brief-research-e2e.test.cjs`, `prewrite-research-tab-browser.test.cjs` |
| Complete missing only | Merged AI evidence + saved Brief | Keep existing accepted answers; reject replaced prompt echoes; do not invent missing answers; recompute saved research | `prewrite-brief-research-e2e.test.cjs` |
| Existing page decision | Sitemap URL candidates in selected market | Full URL keyword overlap **alone** is lexical evidence. A different-market URL cannot veto creation of a Spanish/Dutch page; mark for review instead | `prewrite-expand-existing.test.cjs` |
| Tracker Growth | Stored tracked page and research evidence | Keep exact page, optional verified GSC, case-study lock, editor approval and no auto-publishing | `tracker-case-study-end-e2e.test.cjs`, `tracker-growth-clear-flow.test.cjs` |
| Free Rank Tracker | Verified account, host, market, keyword and saved Google snapshots | A provider error is not a rank; no rank fabricated outside checked depth; API quota respected | `rank-free.test.cjs` |
| Weekly rank digest | Saved positions, project status and successful email acceptance | A provider send failure stays pending; retry delivery independently of Google checks; no false 'sent' status | `rank-free.test.cjs` |
| Rank Tracker → Free Growth | Signed handoff + confirmed email + **tracked website host** + tracked keyword | Reject cross-site, lookalike subdomain and cross-keyword attempts before creating check or changing rank baseline | `rank-free-growth-handoff.test.cjs` |
| Growth publication → Rank Tracker | Free Growth publication and Rank Tracker measurement history | Mark the recorded publication date and the latest already-observed position; without earlier measurement no baseline can be asserted | `rank-free-growth-handoff.test.cjs` |

## Reproducible test gates

1. The Pre-Write Contract workflow tests canonical prompt + research, browser Pre-Write and isolated PostgreSQL 'Complete missing only' + case-study safety.
2. The Free Growth workflow runs Rank Tracker unit tests and the **real** signed Rank Tracker → Free Growth browser + PostgreSQL test, alongside the Free Growth browser and CMS package tests. The handoff test turns `growthLinks` ON *only in the test*. Default live behavior stays governed by `RANK_FREE_GROWTH_LINKS`.
3. The general test workflow checks build/syntax. All tests must be green for the same PR head before squash merge.
4. After merge, verify the exact merge commit is SUCCESS on Railway. Do not equate successful GitHub CI with a completed production deployment.

## Distinctions and remaining limits

- **Research answers / citations / mentions / rankings are separate observations.** A manually pasted answer is not automatically verified as coming from the named AI provider. AI-generated URLs are source leads, not independent original evidence.
- A position is a Google snapshot. Improvement after a website change is a correlation, **not proof** that Growth caused it. Actual clicks require page-scoped Search Console data.
- Same-market URL-word matches still need editorial review of page intent and content: URL morphology is not proof of identical search intent. This PR removes the harmful **cross-market automatic veto**, not all ambiguity.
- Rank Tracker has a feature flag to show Free Growth. When OFF, the UI uses the contact CTA and no handoff is expected.
- Provider API outages, production email deliverability, actual live source correctness and a specific customer's browser state require separate authorized production checks. Local E2E substitutes deterministic external responses rather than inventing 'grounded' evidence.
- Changes do not edit published WordPress pages, overwrite protected case studies, force new URLs or silently publish AI drafts.

## Regression requirements for future changes

Do not remove `tests/rank-free-growth-handoff.test.cjs` from the Free Growth CI path; do not hide the Pre-Write shared prompt from its owner; do not silently count an old/broken AI answer as current evidence; and do not mark a failed digest as delivered.
