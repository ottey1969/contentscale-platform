'use strict';
// Rank tracker → free Growth check (owner 2026-11-11). The tracker's link to the Growth check carries a signed handoff
// for one keyword. The Growth check uses it to fill in the owner's e-mail address and, when the visitor records the date
// the change went live, to mark that keyword as "changed" in the tracker with its position on that day, so both tools
// follow the same change. Nothing else of the tracker is shared, and a check without a handoff works as before.
const links = require('./links.cjs');
const { pgStore } = require('./store.cjs');

function rankHandoff({ store }) {
  async function read(token) {
    const h = links.readHandoff(token); if (!h) return null;
    const account = await store.accountByDashboard(h.nonce); if (!account) return null;
    const project = await store.projectOf(account.id); if (!project) return null;
    const row = (await store.keywords(project.id)).find(k => k.keyword === h.keyword); if (!row) return null;
    return { account, project, keyword: h.keyword, row };
  }
  return {
    read,
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

module.exports = { rankHandoff, pgRankHandoff };
