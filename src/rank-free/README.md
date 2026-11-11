# Free rank tracker (standalone)

A public lead tool, **separate from the Tracker and the Growth check**. A visitor enters their e-mail, website, country
and up to 10 keywords; after confirming the e-mail, every keyword is checked in Google **automatically every week** and
one e-mail per week shows the positions and what changed.

## What a position is

* Google's organic results for that keyword, **country (`gl`) and language (`hl`)**, read through Serper (the provider the
  platform already uses), without personal settings. It is a snapshot at the time of the check, not the Search Console
  average and not what a signed-in person sees.
* The top 30 is checked (at most 3 provider calls, stopping as soon as the site is found). The site's best organic
  position counts; subdomains of the site count, look-alike domains do not.
* Not in the top 30 is shown as "not in top 30", never as a number. A failed provider call is retried six hours later and
  never counts as "not ranking".
* Markets where Google is not the main search engine (China, Russia, South Korea) are named on the form and dashboard.

## What the dashboard shows

* Per keyword: the position, the **trend** of the last checks (a small line, oldest left; "not found" on the bottom line,
  with the best position measured), what changed, the page that ranks, and the **top 3 in Google** for that search.
* Below page position 3: a link to the free Growth check, **filled in** with that page (or the home page), the keyword,
  the market and the language.
* **Keywords Google suggests**: Google's own related searches and "People also ask" questions from page 1 of the last
  checks (no extra provider call, nothing invented), minus what is already tracked. One click adds it (up to the limit;
  at the limit the tool says so instead of dropping a keyword). The weekly e-mail names up to five of them.

## Search Console (optional, by hand) and the best opportunity

* The visitor can upload the Search Console export of the website (Performance → Export → Download CSV; ZIP or CSV,
  at most 3 MB). No Google sign-in. It is refused when its pages are of another website. The country filter in the
  export is shown as written ("all countries" when there is none); nothing is assumed. The latest upload replaces the
  previous one; it can be removed on its own and goes with "Delete my data".
* With it, each tracked keyword shows its clicks, impressions and average position, and "Opportunities from Search
  Console" lists search terms with impressions at average position 4–20 that are not tracked yet (one click tracks).
* **Best opportunity** (top of the dashboard, automatic): the tracked keyword at Google position 4–20 in the last check;
  with Search Console the one with the most impressions, else the one closest to the top. Its button opens the free
  Growth check filled in with the ranking page, keyword, market and language.

## Free plan and limits

| Setting | Default | Env |
|---|---|---|
| Keywords per account | 10 | `RANK_FREE_MAX_KEYWORDS` |
| Countries per account | 1 (one website, one market) | — |
| Check frequency | weekly | — |
| Provider calls per month, all free users together | 3000 | `RANK_FREE_MONTHLY_CALLS` |
| Sign-ups per connection per day | 5 | `RANK_FREE_SIGNUPS_PER_IP` |

When the monthly budget is used up, checks are postponed one day (never dropped, never estimated).

## Accounts and links

* No password. The sign-up sends a confirmation link; only its SHA-256 fingerprint is stored and it works once.
* The dashboard link is a random nonce plus an HMAC with the server secret (`RANK_FREE_SECRET`, else
  `GROWTH_FREE_ADMIN_KEY`); a copy of the database alone cannot open a dashboard. The link stays valid for the account.
* An address that already has a confirmed tracker is never changed from the public form: its owner gets the dashboard
  link by e-mail and changes keywords there.
* Every e-mail has a stop link (no more checks or e-mails; positions stay visible). "Delete my data" removes the account,
  website, keywords and all positions.

## Settings

| Env | Use |
|---|---|
| `RANK_FREE_ENABLED=false` | Turns the tool off |
| `SERPER_API_KEY` | Google results (required for checks) |
| `BREVO_API_KEY`, `FROM_EMAIL` | E-mail (required for sign-up) |
| `RANK_FREE_SECRET` | Signs dashboard links (falls back to `GROWTH_FREE_ADMIN_KEY`) |
| `RANK_FREE_PUBLIC_URL` | Base URL in e-mails (else `PUBLIC_APP_URL`, else https://app.contentscale.site) |
| `RANK_FREE_GROWTH_URL` | Link to the free Growth check shown when a keyword is not on page 1 |
| `RANK_FREE_ADMIN_KEY` | `GET /api/rank-free/admin/stats` with header `x-admin-key` (falls back to `GROWTH_FREE_ADMIN_KEY`) |
| `RANK_FREE_SCHEDULER=0` | Stops the 15-minute background round (checks + weekly e-mails) |

## Files

| File | What it does |
|---|---|
| `engine.cjs` | Reading website, keywords and market; one position check; what changed |
| `store.cjs` | Own tables `rank_free_accounts`, `rank_free_projects`, `rank_free_keywords`, `rank_free_results`, `rank_free_usage` (created automatically); an in-memory store with the same behaviour for tests |
| `runner.cjs` | The automatic round: due keywords, budget, weekly e-mail |
| `texts.cjs` | Page and e-mail texts in English, Dutch and Spanish |
| `links.cjs` | Signed dashboard links |
| `routes.cjs` | Pages, API, limits, admin stats, scheduler |
