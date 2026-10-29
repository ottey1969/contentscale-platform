# Free Growth check (standalone)

A public lead tool, **separate from the Tracker**. A visitor enters one page
(+ optional search term) and their email, and gets:

* one plain-language decision: leave it / add a missing answer / make a separate page / not enough evidence;
* where to add it, with the ranking pages that support it;
* the complete research as a JSON download, to process themselves;
* a "done for you" offer (paid): booking link and/or a request form.

It reuses the existing Growth research engine unchanged
(`src/tracker-growth-automatic-routes.cjs`) through a read-only adapter in
`engine.cjs`: no GSC, no Case Studies, no AI draft, and the engine cannot write.

## Files

| File | What it does |
|---|---|
| `engine.cjs` | Runs the Growth research for one public URL (URL validation, read-only data source) |
| `summary.cjs` | Turns the report into plain language — change wording here |
| `store.cjs` | Own tables `growth_free_checks`, `growth_free_hire_requests` (created automatically) |
| `routes.cjs` | Pages, API, limits, access keys, admin |
| `server.cjs` | Runs the tool on its own (own domain / own Railway service) |

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
| `GROWTH_FREE_ADMIN_KEY` | — | Turns on `/free-growth/admin` (leads list, CSV, delete by email) |
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

`/free-growth/admin`: enter `GROWTH_FREE_ADMIN_KEY` to see the hire requests and
checks, download a CSV, or (API) `POST /api/free-growth/admin/forget {"email":…}`
with header `x-admin-key` to delete everything stored for an email address.

## Tests

`node --test tests/growth-free-check.test.cjs` (workflow `growth-free-check.yml`).
