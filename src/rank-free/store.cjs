'use strict';
// Own tables for the free rank tracker; nothing here reads or writes Tracker or Growth data.
// The verification link is stored only as a SHA-256 fingerprint; the dashboard link is a random nonce plus an HMAC that
// needs the server secret, so a copy of the database alone cannot open a dashboard.
const crypto = require('node:crypto');

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const month = d => d.toISOString().slice(0, 7);

function pgStore(pool) {
  let ensured = null;
  const ensure = () => ensured || (ensured = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS rank_free_accounts(
      id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, lang TEXT NOT NULL DEFAULT 'en',
      verify_hash TEXT, dashboard_nonce TEXT UNIQUE, verified_at TIMESTAMPTZ, opted_out_at TIMESTAMPTZ,
      marketing_consent BOOLEAN NOT NULL DEFAULT FALSE, ip_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rank_free_projects(
      id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES rank_free_accounts(id) ON DELETE CASCADE,
      host TEXT NOT NULL, gl TEXT NOT NULL, hl TEXT NOT NULL, last_digest_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rank_free_keywords(
      id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES rank_free_projects(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, next_check_at TIMESTAMPTZ, last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(project_id, keyword))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rank_free_results(
      id BIGSERIAL PRIMARY KEY, keyword_id BIGINT NOT NULL REFERENCES rank_free_keywords(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, position INTEGER, url TEXT, result JSONB)`);
    // Why the last attempt failed (provider error), so the dashboard can say it instead of "first check is running".
    await pool.query("SET LOCAL lock_timeout='5s'; ALTER TABLE rank_free_keywords ADD COLUMN IF NOT EXISTS last_error TEXT");
    await pool.query("SET LOCAL lock_timeout='5s'; ALTER TABLE rank_free_keywords ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ");
    // The optional Search Console export of the website (latest upload only); removed with the project.
    await pool.query("SET LOCAL lock_timeout='5s'; ALTER TABLE rank_free_projects ADD COLUMN IF NOT EXISTS gsc JSONB");
    await pool.query("SET LOCAL lock_timeout='5s'; ALTER TABLE rank_free_projects ADD COLUMN IF NOT EXISTS gsc_at TIMESTAMPTZ");
    await pool.query('CREATE INDEX IF NOT EXISTS rank_free_results_kw_idx ON rank_free_results(keyword_id, checked_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS rank_free_keywords_due_idx ON rank_free_keywords(next_check_at) WHERE active');
    await pool.query(`CREATE TABLE IF NOT EXISTS rank_free_usage(month TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)`);
  })().catch(e => { ensured = null; throw e; }));
  const q = async (sql, args) => { await ensure(); return (await pool.query(sql, args)).rows; };
  return {
    async signupsSince(ipHash, since) { return Number((await q('SELECT COUNT(*)::int n FROM rank_free_accounts WHERE ip_hash=$1 AND created_at>=$2', [ipHash, since]))[0].n); },
    async findAccountByEmail(email) { return (await q('SELECT * FROM rank_free_accounts WHERE email=$1', [email]))[0] || null; },
    async upsertSignup({ email, lang, ipHash, consent, verifyHash, host, gl, hl, keywords }) {
      const a = (await q(`INSERT INTO rank_free_accounts(email,lang,ip_hash,marketing_consent,verify_hash) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(email) DO UPDATE SET lang=EXCLUDED.lang, verify_hash=EXCLUDED.verify_hash, marketing_consent=rank_free_accounts.marketing_consent OR EXCLUDED.marketing_consent, opted_out_at=NULL
        RETURNING *`, [email, lang, ipHash, consent, verifyHash]))[0];
      const p = (await q(`INSERT INTO rank_free_projects(account_id,host,gl,hl) VALUES($1,$2,$3,$4)
        ON CONFLICT(account_id) DO UPDATE SET host=EXCLUDED.host, gl=EXCLUDED.gl, hl=EXCLUDED.hl RETURNING *`, [a.id, host, gl, hl]))[0];
      await this.setKeywords(p.id, keywords);
      return { account: a, project: p };
    },
    async verify(verifyHash, dashboardNonce, now) {
      const a = (await q('UPDATE rank_free_accounts SET verified_at=COALESCE(verified_at,$3), verify_hash=NULL, dashboard_nonce=COALESCE(dashboard_nonce,$2) WHERE verify_hash=$1 RETURNING *', [verifyHash, dashboardNonce, now]))[0];
      if (a) await q('UPDATE rank_free_keywords SET next_check_at=$2 WHERE project_id IN (SELECT id FROM rank_free_projects WHERE account_id=$1) AND active AND last_checked_at IS NULL', [a.id, now]);
      return a || null;
    },
    async accountByDashboard(dashboardNonce) { return (await q('SELECT * FROM rank_free_accounts WHERE dashboard_nonce=$1 AND verified_at IS NOT NULL', [dashboardNonce]))[0] || null; },
    async projectOf(accountId) { return (await q('SELECT * FROM rank_free_projects WHERE account_id=$1', [accountId]))[0] || null; },
    async setGsc(projectId, data, at) { await q('UPDATE rank_free_projects SET gsc=$2, gsc_at=$3 WHERE id=$1', [projectId, data ? JSON.stringify(data) : null, data ? at : null]); },
    async keywords(projectId) { return q('SELECT * FROM rank_free_keywords WHERE project_id=$1 AND active ORDER BY created_at, id', [projectId]); },
    async setKeywords(projectId, list, now = null) {
      await q('UPDATE rank_free_keywords SET active=FALSE WHERE project_id=$1 AND NOT (keyword = ANY($2::text[]))', [projectId, list]);
      for (const k of list) await q(`INSERT INTO rank_free_keywords(project_id,keyword,next_check_at) VALUES($1,$2,$3)
        ON CONFLICT(project_id,keyword) DO UPDATE SET active=TRUE, next_check_at=COALESCE(rank_free_keywords.next_check_at,EXCLUDED.next_check_at)`, [projectId, k, now]);
    },
    async history(keywordId, limit = 12) { return q('SELECT checked_at,status,position,url,result FROM rank_free_results WHERE keyword_id=$1 ORDER BY checked_at DESC LIMIT $2', [keywordId, limit]); },
    async due(now, limit) {
      return q(`SELECT k.id keyword_id, k.keyword, p.id project_id, p.host, p.gl, p.hl, a.id account_id FROM rank_free_keywords k
        JOIN rank_free_projects p ON p.id=k.project_id JOIN rank_free_accounts a ON a.id=p.account_id
        WHERE k.active AND k.next_check_at IS NOT NULL AND k.next_check_at<=$1 AND a.verified_at IS NOT NULL AND a.opted_out_at IS NULL
        ORDER BY k.next_check_at, k.id LIMIT $2`, [now, limit]);
    },
    async saveResult(keywordId, r, next) {
      await q('INSERT INTO rank_free_results(keyword_id,checked_at,status,position,url,result) VALUES($1,$2,$3,$4,$5,$6)',
        [keywordId, r.checked_at, r.status, r.position || null, r.url || null, r]);
      await q('UPDATE rank_free_keywords SET last_checked_at=$2, next_check_at=$3, last_error=NULL, last_error_at=NULL WHERE id=$1', [keywordId, r.checked_at, next]);
    },
    async postpone(keywordId, next, error = null, at = null) { await q('UPDATE rank_free_keywords SET next_check_at=$2, last_error=COALESCE($3,last_error), last_error_at=COALESCE($4,last_error_at) WHERE id=$1', [keywordId, next, error, at]); },
    async usage(now) { return Number(((await q('SELECT calls FROM rank_free_usage WHERE month=$1', [month(now)]))[0] || { calls: 0 }).calls); },
    async addUsage(now, n) { await q('INSERT INTO rank_free_usage(month,calls) VALUES($1,$2) ON CONFLICT(month) DO UPDATE SET calls=rank_free_usage.calls+EXCLUDED.calls', [month(now), n]); },
    async digestReady(now) {
      // A project is ready for its e-mail when every active keyword has a result newer than the last e-mail.
      return q(`SELECT p.*, a.email, a.lang, a.dashboard_nonce FROM rank_free_projects p JOIN rank_free_accounts a ON a.id=p.account_id
        WHERE a.verified_at IS NOT NULL AND a.opted_out_at IS NULL
          AND EXISTS(SELECT 1 FROM rank_free_keywords k WHERE k.project_id=p.id AND k.active)
          AND NOT EXISTS(SELECT 1 FROM rank_free_keywords k WHERE k.project_id=p.id AND k.active AND (k.last_checked_at IS NULL OR k.last_checked_at<=COALESCE(p.last_digest_at,'epoch')))`, []);
    },
    async markDigest(projectId, now) { await q('UPDATE rank_free_projects SET last_digest_at=$2 WHERE id=$1', [projectId, now]); },
    async optOut(dashboardNonce, now) { return (await q('UPDATE rank_free_accounts SET opted_out_at=$2 WHERE dashboard_nonce=$1 RETURNING id', [dashboardNonce, now])).length > 0; },
    async forget(dashboardNonce) { return (await q('DELETE FROM rank_free_accounts WHERE dashboard_nonce=$1 RETURNING id', [dashboardNonce])).length > 0; },
    async stats(now) {
      const r = (await q(`SELECT (SELECT COUNT(*) FROM rank_free_accounts)::int accounts,
        (SELECT COUNT(*) FROM rank_free_accounts WHERE verified_at IS NOT NULL)::int verified,
        (SELECT COUNT(*) FROM rank_free_keywords WHERE active)::int keywords`, []))[0];
      return { ...r, calls_this_month: await this.usage(now) };
    },
  };
}

// The same behaviour in memory, for tests and for running without a database.
function memoryStore() {
  const db = { accounts: [], projects: [], keywords: [], results: [], usage: {} };
  let id = 1;
  const store = {
    db,
    async signupsSince(ipHash, since) { return db.accounts.filter(a => a.ip_hash === ipHash && a.created_at >= since).length; },
    async findAccountByEmail(email) { return db.accounts.find(a => a.email === email) || null; },
    async upsertSignup({ email, lang, ipHash, consent, verifyHash, host, gl, hl, keywords }) {
      let a = db.accounts.find(x => x.email === email);
      if (!a) { a = { id: id++, email, created_at: new Date(), verified_at: null, dashboard_nonce: null, ip_hash: ipHash, marketing_consent: false }; db.accounts.push(a); }
      Object.assign(a, { lang, verify_hash: verifyHash, marketing_consent: a.marketing_consent || consent, opted_out_at: null });
      let p = db.projects.find(x => x.account_id === a.id);
      if (!p) { p = { id: id++, account_id: a.id, last_digest_at: null }; db.projects.push(p); }
      Object.assign(p, { host, gl, hl });
      await store.setKeywords(p.id, keywords);
      return { account: a, project: p };
    },
    async verify(verifyHash, dashboardNonce, now) {
      const a = db.accounts.find(x => x.verify_hash && x.verify_hash === verifyHash); if (!a) return null;
      Object.assign(a, { verified_at: a.verified_at || now, verify_hash: null, dashboard_nonce: a.dashboard_nonce || dashboardNonce });
      const p = db.projects.find(x => x.account_id === a.id);
      for (const k of db.keywords) if (p && k.project_id === p.id && k.active && !k.last_checked_at) k.next_check_at = now;
      return a;
    },
    async accountByDashboard(h) { return db.accounts.find(a => a.dashboard_nonce === h && a.verified_at) || null; },
    async projectOf(accountId) { return db.projects.find(p => p.account_id === accountId) || null; },
    async setGsc(projectId, data, at) { Object.assign(db.projects.find(p => p.id === projectId), { gsc: data || null, gsc_at: data ? at : null }); },
    async keywords(projectId) { return db.keywords.filter(k => k.project_id === projectId && k.active); },
    async setKeywords(projectId, list, now = null) {
      for (const k of db.keywords) if (k.project_id === projectId && !list.includes(k.keyword)) k.active = false;
      for (const kw of list) {
        const k = db.keywords.find(x => x.project_id === projectId && x.keyword === kw);
        if (k) { k.active = true; if (!k.next_check_at) k.next_check_at = now; }
        else db.keywords.push({ id: id++, project_id: projectId, keyword: kw, active: true, next_check_at: now, last_checked_at: null, created_at: new Date() });
      }
    },
    async history(keywordId, limit = 12) { return db.results.filter(r => r.keyword_id === keywordId).sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, limit); },
    async due(now, limit) {
      return db.keywords.filter(k => k.active && k.next_check_at && k.next_check_at <= now).map(k => {
        const p = db.projects.find(x => x.id === k.project_id), a = db.accounts.find(x => x.id === p.account_id);
        return a.verified_at && !a.opted_out_at ? { keyword_id: k.id, keyword: k.keyword, project_id: p.id, host: p.host, gl: p.gl, hl: p.hl, account_id: a.id } : null;
      }).filter(Boolean).slice(0, limit);
    },
    async saveResult(keywordId, r, next) {
      db.results.push({ keyword_id: keywordId, checked_at: r.checked_at, status: r.status, position: r.position || null, url: r.url || null, result: r });
      Object.assign(db.keywords.find(k => k.id === keywordId), { last_checked_at: new Date(r.checked_at), next_check_at: next, last_error: null, last_error_at: null });
    },
    async postpone(keywordId, next, error = null, at = null) { const k = db.keywords.find(x => x.id === keywordId); k.next_check_at = next; if (error) { k.last_error = error; k.last_error_at = at; } },
    async usage(now) { return db.usage[month(now)] || 0; },
    async addUsage(now, n) { db.usage[month(now)] = (db.usage[month(now)] || 0) + n; },
    async digestReady() {
      return db.projects.filter(p => {
        const a = db.accounts.find(x => x.id === p.account_id); if (!a.verified_at || a.opted_out_at) return false;
        const ks = db.keywords.filter(k => k.project_id === p.id && k.active);
        return ks.length && ks.every(k => k.last_checked_at && (!p.last_digest_at || k.last_checked_at > p.last_digest_at));
      }).map(p => { const a = db.accounts.find(x => x.id === p.account_id); return { ...p, email: a.email, lang: a.lang, dashboard_nonce: a.dashboard_nonce }; });
    },
    async markDigest(projectId, now) { db.projects.find(p => p.id === projectId).last_digest_at = now; },
    async optOut(h, now) { const a = db.accounts.find(x => x.dashboard_nonce === h); if (a) a.opted_out_at = now; return !!a; },
    async forget(h) { const a = db.accounts.find(x => x.dashboard_nonce === h); if (!a) return false;
      const p = db.projects.find(x => x.account_id === a.id);
      if (p) { const ks = db.keywords.filter(k => k.project_id === p.id).map(k => k.id); db.results = db.results.filter(r => !ks.includes(r.keyword_id)); db.keywords = db.keywords.filter(k => k.project_id !== p.id); db.projects = db.projects.filter(x => x !== p); }
      db.accounts = db.accounts.filter(x => x !== a); return true; },
    async stats(now) { return { accounts: db.accounts.length, verified: db.accounts.filter(a => a.verified_at).length, keywords: db.keywords.filter(k => k.active).length, calls_this_month: await store.usage(now) }; },
  };
  return store;
}

module.exports = { pgStore, memoryStore, hash, token };
