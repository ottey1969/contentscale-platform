# Free Growth check (standalone)

A public lead tool, **separate from the Tracker**. A visitor enters one page
(+ optional search term) and their email, and gets:

* one plain-language decision: leave it / add a missing answer / make a separate page / not enough evidence;
* where to add it, with the ranking pages that support it;
* **AI answers** (Google AIO / Gemini, ChatGPT Search, Perplexity, Claude, Copilot): the visitor copies one
  prompt for the exact search term — the same prompt as the Quick Scan "Keyword / question" mode — into each AI
  system and pastes the answer back. The check shows per AI system how many source links it gave, whether your site
  or this exact page is cited, which sites AI cites instead, and which of those also rank in Google.
  No AI API is called (no cost); answers are stored per check (`growth_free_ai_answers`) and included in the JSON.
  A test keeps the prompt identical to the Quick Scan prompt in `src/index.js`;
* the complete research as a JSON download, to process themselves;
* a "done for you" offer (paid): booking link and/or a request form.

It reuses the existing Growth research engine unchanged
(`src/tracker-growth-automatic-routes.cjs`) through a read-only adapter in
`engine.cjs`: no GSC, no Case Studies, no AI draft, and the engine cannot write.

## Files

| File | What it does |
|---|---|
| `engine.cjs` | Runs the Growth research for one public URL (URL validation, read-only data source) |
| `summary.cjs` | Turns the Google report into plain language — change wording here |
| `ai-answers.cjs` | AI prompt, reading pasted AI answers, AI summary |
| `store.cjs` | Own tables `growth_free_checks`, `growth_free_ai_answers`, `growth_free_invites`, `growth_free_hire_requests` (created automatically) |
| `routes.cjs` | Pages, API, limits, access keys, admin |
| `server.cjs` | Runs the tool on its own (own domain / own Railway service) |

## Who can use it — three ways

| Who | How | Limits |
|---|---|---|
| **You** | `/free-growth/admin` → log in with `GROWTH_FREE_ADMIN_KEY` → "Run a check yourself" | None (24-hour cache still applies) |
| **Someone you invite** | Admin → "Invite someone" → send the personal link | Per link: number of checks (default 3), validity (default 7 days), optionally only one email address. Withdraw with one click; takes effect immediately. |
| **The public on your own site** | An access key with `hosts` (below) — no code in the link | Per email, per IP, per key per day + total daily cap |

Invitation links:
* are 32 random characters; only a SHA-256 fingerprint is stored, so the link is shown once and cannot be recovered (create a new one if lost);
* with an email lock, a shared link is useless to anyone else;
* a check served from the 24-hour cache, or a check that fails, does not use up the invitation;
* work on any domain (no site key needed) and cannot be embedded in other sites.

Admin login: a signed session cookie (HttpOnly, SameSite=Strict, Secure on https, 12 hours);
changes need an extra header that other websites cannot send; 10 wrong attempts per IP block
login for 15 minutes; the admin key is never accepted in a URL and must be at least 16 characters.
Changing `GROWTH_FREE_ADMIN_KEY` ends every session.

## Access keys — where it may be used

Nothing runs without a valid key. Without one, the page says "not activated
here" and no paid search is made. Keys are set in `GROWTH_FREE_ACCESS_KEYS`:

```
GROWTH_FREE_ACCESS_KEYS=my-own-site-2026,linkedin-campaign-01
```

or with settings per key (JSON):

```
GROWTH_FREE_ACCESS_KEYS=[{"key":"contentscale-site-01","label":"contentscale.site","hosts":["contentscale.site"],"origins":["https://contentscale.site"],"daily":30,"per_email":3,"contact_url":"https://cal.com/you","brand":"ContentScale","service_text":"I write the missing sections for you."},{"key":"partner-roofer-77","label":"partner roofer","origins":["https://partner.example"],"daily":5}]
```

* `key` (8–80 letters, digits, `-`, `_`) goes in the link: `/free-growth?key=contentscale-site-01`.
  Keys are visible in the link, so they are not passwords: the limits and allowed sites are the protection.
* `hosts`: domains where **no key is needed in the link** — typically your own site, e.g.
  `"hosts":["contentscale.site","free.contentscale.site"]` → `https://free.contentscale.site/free-growth` just works,
  and the key is not visible in the page. On every other domain the key is still required.
* `origins`: the only websites that may embed the page in an iframe (and post to it). Empty = anywhere.
* `daily`: free checks per day for this key. `per_email`: per visitor email per day.
* `contact_url`, `brand`, `service_text`: the paid offer shown under results that came through this key.
* `label`: shown in the admin list, the CSV and the webhook, so you see where each lead came from.
* Remove a key from the variable to switch that placement off.

Embed on a website:

```html
<iframe src="https://YOUR-DOMAIN/free-growth?key=contentscale-site-01" style="width:100%;height:1100px;border:0" title="Free Growth check"></iframe>
```

## Other settings (all optional)

| Variable | Default | Meaning |
|---|---|---|
| `GROWTH_FREE_ENABLED` | on | `false` removes all routes |
| `GROWTH_FREE_DAILY_LIMIT` | 50 | Total free checks per day over all keys (cost cap) |
| `GROWTH_FREE_PER_EMAIL_PER_DAY` | 3 | Default per-email limit |
| `GROWTH_FREE_PER_IP_PER_DAY` | 3 | Per visitor IP (stored hashed) |
| `GROWTH_FREE_CONCURRENCY` | 2 | Checks running at the same time |
| `GROWTH_FREE_ADMIN_KEY` | — | 16+ characters. Turns on `/free-growth/admin` (own checks, invitations, leads, CSV, delete by email) |
| `GROWTH_FREE_HIRE_WEBHOOK_URL` | — | https URL that receives every "do it for me" request (Slack, Zapier, Make) |
| `GROWTH_FREE_CONTACT_URL` / `_BRAND` / `_SERVICE_TEXT` | — | Defaults for keys that do not set them |
| `GROWTH_FREE_PRIVACY_URL` | — | Privacy link in the footer |
| `GROWTH_FREE_IP_SALT` | `SESSION_SECRET` | Salt for hashing IP addresses |
| `SERPER_API_KEY` | — | Required for the Google search step (same as Growth) |

The same check for the same page and search term within 24 hours is served
from the stored result: no new paid search, and it does not count toward limits.

## Running it

* Inside the main app: mounted automatically at `/free-growth` (API `/api/free-growth`).
* On its own: `DATABASE_URL=… SERPER_API_KEY=… GROWTH_FREE_ACCESS_KEYS=… npm run free-growth`
  (`/` redirects to `/free-growth`, `/health` for the platform health check).
  It only needs its own two tables, not the Tracker tables.

## Admin

`/free-growth/admin`: log in with `GROWTH_FREE_ADMIN_KEY` to run your own checks, create and
withdraw invitations, see hire requests and checks, download a CSV and delete everything stored
for an email address. Scripts can use the same API with the header `x-admin-key`.

## Tests

`node --test tests/growth-free-check.test.cjs` (workflow `growth-free-check.yml`).

## Choose what goes on your site (editor mode)

The standalone check never writes text. Each result has a **Choose what goes on your site** section that lists every difference with the readable ranking pages:

- topics not on the page;
- topics only partly on the page, with the closest section on the page;
- page elements that most ranking pages have (FAQ, tables, lists, video, structured data, author, date, length);
- topics that could not be matched to the page.

Each item names the ranking pages and their Google positions. Tick what should go on the site, then **Download selection as editor brief** (Markdown checklist) or **Copy**. Grouping by topic needs `GEMINI_API_KEY`. Without it, every section of every ranking page is listed separately ("not grouped"). It is an observation, not a fact check.
