'use strict';
// Rank tracker → free Growth check (owner 2026-11-11). The tracker's link to the Growth check carries a signed handoff
// for one keyword. The Growth check uses it to fill in the owner's e-mail address and, when the visitor records the date
// the change went live, to mark that keyword as "changed" in the tracker with its position on that day, so both tools
// follow the same change. Nothing else of the tracker is shared, and a check without a handoff works as before.
const links = require('./links.cjs');
const { pgStore } = require('./store.cjs');

// A valid handoff is also access to the free Growth check (owner 2026-11-11), also when the Growth check asks for personal
// approval: the tracker account's e-mail address is confirmed and only its owner gets the link. Its own limit per
// account (RANK_FREE_GROWTH_PER_WEEK, default 3 checks in 7 days) keeps the cost bounded.
const perWeekOf = env => { const v = String(env.RANK_FREE_GROWTH_PER_WEEK ?? '').trim(); return v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 3; };
function rankHandoff({ store, perWeek = perWeekOf(process.env), now = () => new Date() }) {
  async function read(token) {
    const h = links.readHandoff(token); if (!h) return null;
    const account = await store.accountByDashboard(h.nonce); if (!account) return null;
    const project = await store.projectOf(account.id); if (!project) return null;
    const row = (await store.keywords(project.id)).find(k => k.keyword === h.keyword); if (!row) return null;
    return { account, project, keyword: h.keyword, row };
  }
  return {
    read, perWeek,
    // Checks started from the tracker by this account in the last 7 days, and whether another one fits.
    async allowance(r) { const used = await store.handoffsSince(r.account.id, new Date(now().getTime() - 7 * 864e5)); return { used, limit: perWeek, ok: used < perWeek }; },
    async attach(checkId, token) {
      const r = await read(token); if (!r || !checkId) return false;
      await store.saveHandoff(String(checkId), r.account.id, r.keyword); return true;
    },
    // The date the change went live (YYYY-MM-DD), or null when it was removed. The position is the one of the last check
    // on or before that day; without such a check there is no "before" position and nothing is marked.
    async published(checkId, day) {
      const h = await store.handoffOf(String(checkId)); if (!h) return false;
      const account = await store.accountById(h.account_id); const project = account && await store.projectOf(account.id); if (!project) return false;
      if (!day) return store.markChanged(project.id, h.keyword, null, null);
      const row = (await store.keywords(project.id)).find(k => k.keyword === h.keyword); if (!row) return false;
      const end = new Date(day + 'T23:59:59Z');
      const before = (await store.history(row.id, 30)).map(x => x.result).find(r => r && new Date(r.checked_at) <= end);
      if (!before || before.status !== 'FOUND') return false;
      return store.markChanged(project.id, h.keyword, new Date(day + 'T12:00:00Z'), before.position);
    },
  };
}
const pgRankHandoff = pool => rankHandoff({ store: pgStore(pool) });
// Defaults of a check started with a handoff (the Free Growth form needs a brand, contact and limits like an access key).
const handoffEntry = config => ({ key: '', label: 'rank-tracker', origins: [], hosts: [], daily: config.daily, perEmail: config.perEmail,
  brand: config.brand, contactUrl: config.contactUrl, serviceText: config.serviceText });

module.exports = { rankHandoff, pgRankHandoff, handoffEntry, perWeekOf };
