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

**Advice, not a gate.** If there is no key, the call fails or the answer is invalid, the word-matched candidates stay, labelled `NOT_VERIFIED`. The evidence status then reads `CANDIDATE_GAP_MEANING_NOT_VERIFIED`. Only an actual "different questions" judgement removes a candidate from the automatic plan; the editor's list still shows its topics. An unavailable answer check never rejects a section.

**Editor writes.** Set `GROWTH_AI_DRAFTS=off` to keep the research and the confirmed reader questions but generate no AI text. The CMS handoff takes the editor's own text.

## Competitor overview for the editor

Every research run with a readable page adds `competitor_overview`: what the readable ranking pages contain that this page does not. It is an observation, not a fact check and not a verified gap. The editor decides what to add, which is the main deliverable when `GROWTH_AI_DRAFTS=off`.

- **Page elements** (deterministic, from HTML). Length, H2/H3, FAQ, question headings, tables, lists, images, video, structured data types, author and date. An element is reported when at least half of the ranking pages (minimum two) have it and this page does not.
- **Topics.** All content headings of every ranking page; furniture and the competitor's own sales sections are left out. They are grouped by meaning in one model call, with per topic whether this page covers it (YES / PARTLY / NO with an existing heading). Invented hosts or headings are dropped, an invented page heading never counts as covered, and headings the model leaves out are still listed. Without the model, the full heading list per ranking page is delivered, marked as not grouped.

The overview is shown on the research page and on the CMS handoff page, and is included in the owner package (Markdown).

## Hybrid flow: research → AI labels → owner selection → writing for the selection

Growth no longer writes text by itself. One flow serves the Tracker and the standalone check:

1. **Research (automatic, no AI required).** Serper.dev results, competitor pages read, page elements compared, evidence kept. It always yields a result.
2. **Intelligence (AI advises).** The meaning check labels candidate reader questions (same question / not judged), and the overview groups topics. An AI failure never blocks: items stay, labelled "not judged" or "not grouped". Only an actual "different questions" judgement takes a pair out of the automatic plan, and its topics stay in the list.
3. **Editor (owner chooses).** `buildGapList` (`src/growth-gap-list.cjs`) lists every difference:
   - questions two ranking pages answer;
   - topics not on the page, or only partly;
   - topics not matched to the page;
   - ungrouped competitor sections;
   - page elements.

   Every difference is listed, verified or not: a "different questions" judgement only adds a label with its reason, and the owner can still choose the item. What the check already finds on the page (covered questions, topics the page has) is not listed, and each competitor section appears once (no duplicates).

   Each item carries its AI label and competitor examples. In the Tracker the list is stored per research run (`tracker_growth_gap_lists`); the owner ticks items, downloads an editor brief, or asks for concepts. Opening the research page writes nothing (`POST …/complete` with `write:false`); the automatic-plan draft stays available on an explicit click.
4. **Writing (only the selection).** `POST …/auto-research/write` with `gap_list_id` and `item_ids`.
   - Items are read from the stored list, never from the browser; at most four per run; page elements are not written.
   - The writer gets each item's reader question and competitor sections, plus one repair attempt.
   - If doubt remains, the result is a **marked concept**: failing sentences are flagged with the reason, never withheld or silently edited.
   - The concept is stored as the newest proposal (`SELECTION_CONCEPT…`), so the CMS handoff picks it up. Flagged sentences become a "Flagged by Growth: rewrite or remove" checklist that must be ticked.
5. **Tracker (measure after real publication).** Unchanged: publication is recorded with GSC optional, then measured over two equal 28-day windows.

`copy_ready` and every concept mean "ready for human review", never "facts verified" or "publication approved".

### Guarantees of the writing step (review of PR #221)

1. **No silent cuts.** More than four writable items in one run is refused (`SELECT_AT_MOST_4_TO_WRITE`); the UI says so before sending. The brief can hold any number of items.
2. **No stale advice.** The gap list stores a fingerprint of all readable text of the page as researched; scripts and styles don't count. Before any AI call the live page is read again; a different fingerprint is refused (`PAGE_CHANGED_SINCE_RESEARCH_RERUN_RESEARCH`).
3. **Strict linking.** A written section belongs to a selected item only through the exact task code the writer was given, once per item. Missing, unknown or repeated codes are listed as `unlinked_sections`, never placed and never stored in the proposal; the item is reported as not written.
4. **Proof, not ticks.** For a concept with flagged sentences, the CMS package is refused (`FLAGGED_CONTENT_NOT_RESOLVED`, with `blocked_details` naming each sentence) when any of these holds:
   - a flagged sentence is still in the final text;
   - the final text fails the claim checks again against the original page;
   - a heading still promises reasons but gives steps.

   Only a resolved text is packaged; `06-fact-check-before-publishing.md` then records what was resolved.

### Technical notation is not a statistic (report 56)

The claim check ignores technical notation when it looks for unsourced figures: HTTP status codes ("non-200", "301 redirects", "4xx/404 pages"), language/region codes and tokens such as `en-GB`, `ISO-3166`, `h2`. Real figures stay checked: "68%", "In 2025, 40 markets", "a 200 page site" are still flagged without a source.

### Search market (report 56)

Competitor research searches where the page competes, from what the page itself states (`src/growth-search-locale.cjs`), in this order: a country-code domain (`.nl`, `.co.uk`); countries named in the title and headings (most named first); the region of its own hreflang; the region of `<html lang>`. A US-state market from the query/keyword/URL keeps the US lookup with its location. Without any signal the default stays US / English and the report says so.

Serper gets `gl`/`hl` for that market; Bing RSS gets `cc`/`setlang`. A page that names several markets spends the one allowed extra paid call on its second market (instead of result page 2); further markets are listed as `target_markets_not_searched`. Never more than two paid calls per run.

### One leading decision

When the editorial decision gate decides, the earlier automatic opportunity (e.g. `DISTINCT_SPOKE_RESEARCH_REQUIRED`) is kept for traceability but marked `stage: EARLIER_RESEARCH_STEP`, `superseded_by: editorial_decision_gate`, and shown as "Earlier research step (replaced by the decision at the top)".
