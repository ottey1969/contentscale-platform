# Rules for every AI agent working on ContentScale

These rules come from the owner. They apply to every agent and every change: Claude, ChatGPT/Codex, Cursor or anything else. If a rule conflicts with a task, stop and ask the owner. Do not work around the rule.

## Workflow
- Work on a branch and open a pull request. Never push to `main`.
- Merge only after CI is green **and** the owner has said "Squash and merge" (squash merge).
- Every change keeps `tests/golden-owner-cases.test.cjs` green. These are real owner cases: the bugs that came back after "harmless" refactors. If one of them must change, the owner decides, not the agent.
- A test that reproduces the bug comes before the fix. Never skip, weaken or delete a test to get green.
- Do not commit generated files. The end-to-end tests write `src/_*_e2e_*.js` builds; they are git-ignored.
- Report results honestly: what was tested and how (unit, real server plus Postgres, browser), and what was not.

## Content and data (Pre-Write, Growth, Free Growth, Tracker)
- **No invented data.** Every amount, percentage, statistic or quote needs a source page on which it actually appears, in the same currency. Without one it is left out, not "estimated".
- **No links to competitors.** Sites that rank for the same query are research only and never a link target. Official and primary sources (government, standards bodies, the vendor itself) are allowed.
- **Existing page before a new page.** When the site already has a page for the same intent in the same market, the advice is to expand that page. This also applies to price questions ("cost", "wat kost", "precio", "tarifas") about a service page. A page in another market (es., nl., /es/) never forces an expansion. A page without a market marker is the site's default market.
- **What to do comes first.** A Brief opens with the decision: expand which URL, or create a new page at which slug.
- **"Geo" means Generative Engine Optimization** in this product. Geotechnical, geology, geography and geospatial are other fields.
- **Internal data never goes to clients.** Generator prompts, Gemini usage (calls, tokens, models, cost guard), API keys and admin data stay server-side, or are visible to owner domains only (`INTERNAL_USAGE_DOMAINS`). Strip them on the server; hiding them in the UI is not enough.
- **Perplexity is a fallback.** It is fetched automatically only when the manual Perplexity answer is empty.
- Do not circumvent bot blocks or paywalls on source sites.

## WordPress
- Back up a page before editing it. Publish only after the owner says "publiceer".
- **contentscale.site (nl., es.)**: the WordPress page title stays **empty**, because the theme would print a second H1. The SEO title and meta description go into Rank Math.
- **perfectroofingteam.com (Elementor)**: the WordPress title **must exist**, because the menu items use the page titles. Prevent a double H1 with the Elementor page setting "hide title", never by emptying the title. Author: "Written & reviewed by Perfect Roofing Team" (never Ottmar Francisca). Prices are always indicative: $250–$5,800+ across services; larger projects about $12,000 or more, quoted individually after an on-site assessment.
- Every page gets a meta title, a meta description, a focus keyword (the literal customer phrase), an author box and hreflang (NL/ES/EN, with x-default pointing to EN).
- No duplicate Article schema next to the theme's own.

## Communication
- The owner writes in Dutch; answer in Dutch.
- The owner's personal data (e-mail and the like) never goes into external requests.
