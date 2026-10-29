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

## From approved proposal to the website (CMS handoff)

1. **Research** (owner link, `POST …/growth/auto-research/complete`). Only a checked improvement of an existing page (`IMPROVE_EXISTING` with `copy_ready`) is stored in `tracker_growth_proposals`. The stored proposal holds the H2s, text, placement, fact-check list, evidence label and intent note. A protected Case Study page never gets a stored proposal. The research page then links to the CMS page of the page that should change, which may differ from the researched page.
2. **CMS page** (`/track/<owner token>/growth/cms-export?page_id=`). It loads the latest proposal for that page and URL (`GET …/cms-export/proposal`, owner link only; 409 for a locked page). It pre-fills the text and the proposed position, and the owner can change the position. Every sentence that needs a fact-check, business confirmation or safety review must be ticked before the download button works. Editorial approval is still required.
3. **Package** (`POST …/cms-export`, JSON + ZIP). Each change carries its placement. The manifest records `growth_proposal.id` and whether the editor changed the text (`editor_changed_text`), and `06-fact-check-before-publishing.md` lists the open checks. A proposal belonging to another page or URL is refused with `GROWTH_PROPOSAL_NOT_FOR_THIS_PAGE`. Nothing is published, and the website is never contacted.
4. **Publication** (`POST …/growth/publication`). Only after the editor has actually published, the owner records the date and what changed. Search Console is optional: without verified page/query data the record is saved with `gsc_evidence = NEEDS_ACCESS`. Locked Case Study pages are still refused.
5. **Measurement.** The Cockpit marks the page as recently changed for 28 days. After that, clicks are compared only when both equal 28-day Search Console windows (before and after) have been entered; there is no number before that.

The full chain runs against a real PostgreSQL database in `tests/growth-cms-chain-postgres.test.cjs` (workflow `growth-cms-handoff-chain.yml`).

## Reader tasks: candidates by shared words, confirmed by meaning

Word overlap between two competitor pages only proposes *candidate* tasks. Production reports showed many pairs that share one word but answer different questions (for example "prioritize content for citations vs mentions" versus "which AI platform to prioritize"). A shared word also does not prove that the page already answers the question.

`src/growth-task-meaning.cjs` therefore makes two judgements with the configured language model (`GEMINI_API_KEY`; model `GROWTH_JUDGE_MODEL`, default `GEMINI_MODEL_BRIEF`):

1. **One call per research run.** For each candidate it decides:
   - whether the competitor sections answer the same reader question, and states that question;
   - which websites answer it;
   - whether the page answers it (YES, PARTLY or NO, naming an existing heading).

   Every answer is validated against the input: only known task codes, only hosts that support the task, at least two hosts, and only exact page headings. Anything else confirms nothing.
2. **One call per owner draft.** It checks whether each drafted section answers its confirmed question. A section that does not (or cannot be checked) is rejected like any other failed section.

**Fail closed.** If there is no key, the call fails or the answer is invalid, no task is confirmed. The gate reports `TASK_MEANING_NOT_VERIFIED`, and the editor writes from the candidate topics.

**Editor writes.** Set `GROWTH_AI_DRAFTS=off` to keep the research and the confirmed reader questions but generate no AI text. The CMS handoff takes the editor's own text.
