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
* **"I have changed this page"** on the best opportunity: the date and that day's position are kept. The keyword stays the
  best opportunity while it does not grow, with what the checks since then show instead of the same advice each week:
  waiting (under 6 weeks, Google often needs 2–6), growing (higher than on the day of the change), or no growth after
  6 weeks (the Growth check comes back as the main action and it can be marked again). Undo is possible.
* The weekly e-mail carries the same best opportunity, follow-up and filled-in Growth check link.

## Into the free Growth check (`handoff.cjs`)

1. Every Growth link (best opportunity, keyword rows, weekly e-mail) opens `/free-growth` with the ranking page (else the
   home page), the keyword as **`topic`** (not as the question), the market, the language and **`rt`**: a signed handoff
   (dashboard nonce + keyword, HMAC with the server secret).
2. The form shows "From your rank tracker: …" and fills in the owner's e-mail address (`GET /api/rank-free/handoff?rt=`,
   only with a valid signature). The customer question stays empty.
3. The check asks Google about the topic and picks the best real customer question (People also ask / related
   searches); without one, the keyword itself is researched. A topic never reuses a stored result for the page.
4. The check is linked to the keyword (`rank_free_handoffs`). Recording the publication date in the Growth check marks
   the keyword "changed" in the tracker, with the position of its last check on or before that day; removing the date
   removes it. Without a check before that day nothing is marked. Deleted with "Delete my data".
5. **A valid handoff is access of its own**, also when `GROWTH_FREE_APPROVAL_REQUIRED=true` or the domain has no access key:
   the tracker account's e-mail address is confirmed and only its owner gets the link. The tracker address must be
   among the e-mail addresses of the check. Own limit: `RANK_FREE_GROWTH_PER_WEEK` checks per account in 7 days
   (default 3; `0` turns it off), plus the Growth check's daily total. Without a valid handoff nothing changes.

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
| `RANK_FREE_GROWTH_URL` | The free Growth check the tracker links to |
| `RANK_FREE_GROWTH_PER_WEEK` | Growth checks per tracker account in 7 days through the handoff (default 3) |
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

## Google Maps (optional, per project)
A project can set a place, for example `Lodi, NJ`, at sign-up or on the dashboard. Each weekly round then searches every keyword
in Google Maps for that place (`<keyword> <place>`, through Serper `/maps`, one call per keyword). The business counts when the
website on its Maps listing is the tracked site; otherwise the result is "not in the top N". The call counts against the
monthly budget; when it does not fit, the organic result is still saved and Maps says "skipped this week". The dashboard row and
the weekly e-mail show the Maps position under the Google position. An empty place switches Maps off.

## Geo-grid (optional, up to 3 keywords)
With a place set, the owner can choose up to `MAX_GRID_KEYWORDS` (3) tracked keywords for a 3 × 3 geo-grid. The centre is the
business's own Google Maps listing found in that round's Maps check (its latitude/longitude); without it the grid says "no centre
yet" and makes no calls. From each of the 9 points (about 1.6 km apart, zoom 14) the keyword is searched in Google Maps
(Serper `/maps` with `ll`), and the position of the tracked site's listing is recorded per point. 9 calls per keyword per round,
counted against the monthly budget. More than a third of failed points makes the whole grid an error, never "not found". The
dashboard and weekly e-mail show a summary and a small 3 × 3 table (green top 3, amber 4–10, red 11+, grey × not shown).
