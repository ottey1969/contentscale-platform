'use strict';

const { exactUrl } = require('./implementation-report.cjs');
const { openReport } = require('./gsc-report/store.cjs');
const growth = require('./growth-free/store.cjs');
const { relatedChecks } = require('./growth-free/contentscore.cjs');

const EVENT = 'proof_source_linked';
const TYPES = new Set(['free_growth', 'gsc_audit']);
const EXPORT_SOURCES = new Set(['EXPORT', 'PAGE_EXPORT', 'PAGE_QUERY_EXPORT']);
const exact = (value, url) => {
  try { return exactUrl(value) === url; } catch { return false; }
};
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const history = value => Array.isArray(value) ? value : value ? [value] : [];

function auditPageEvidence(report, url) {
  const find = rows => (rows || []).find(page => exact(page.url, url));
  if (!find(report.pages)) return null;
  const periods = [{ period: report.kpis?.period, pages: report.pages }, ...history(report.after_history || report.after).map(item => ({ ...item, exported: true }))];
  const observations = periods.flatMap(({ period, pages, exported, added_at }) => {
    const page = find(pages);
    if (!page || !period?.start || !period?.end || (!exported && !EXPORT_SOURCES.has(page.source))) return [];
    const clicks = numeric(page.clicks), impressions = numeric(page.impressions);
    return [{ period, source: page.source || 'EXPORT', observed_at: added_at || null, clicks, impressions, position: numeric(page.position),
      ctr: clicks != null && impressions > 0 ? clicks / impressions : null, queries: page.queries || [] }];
  });
  return { observations, contentscore: history(report.contentscores?.[url]) };
}

async function loadProofSources(pool, { clientId, pageId, url, events }) {
  const out = { free_growth: [], gsc_audit: [] };
  const directChecks = new Set();
  const invitedChecks = new Set();
  for (const event of events) {
    const ref = event.event_data;
    if (event.event_type !== EVENT || !TYPES.has(ref?.type) || ref.url !== url) continue;
    if (ref.type === 'gsc_audit') {
      const row = (await pool.query(
        `SELECT r.report,r.created_at,CASE WHEN NOT EXISTS (
           SELECT 1 FROM gsc_reports other WHERE other.id<>r.id AND other.growth_invite=r.growth_invite
             AND other.revoked_at IS NULL AND other.expires_at>NOW()
         ) THEN r.growth_invite END AS exclusive_invite
         FROM gsc_reports r WHERE r.id=$1 AND r.revoked_at IS NULL AND r.expires_at>NOW()`, [ref.source_id])).rows[0];
      const evidence = row && auditPageEvidence(row.report, url);
      if (evidence) {
        out.gsc_audit.push({ ...evidence, recorded_at: row.created_at });
        if (row.exclusive_invite) {
          const checks = await relatedChecks(pool, [url], { invite: row.exclusive_invite }).catch(error => {
            if (['42P01', '42703'].includes(error.code)) return [];
            throw error;
          });
          for (const check of checks) if (check.matching_invite === true) invitedChecks.add(String(check.id));
        }
      }
    } else {
      directChecks.add(String(ref.source_id));
    }
  }
  // An explicit binding takes precedence over access inherited through a report.
  if (invitedChecks.size) {
    const { rows } = await pool.query(
      `SELECT e.event_data->>'source_id' AS id FROM tracker_case_study_events e
       LEFT JOIN tracker_case_studies c ON c.id=e.case_study_id
       WHERE e.event_type=$1 AND e.event_data->>'type'='free_growth' AND e.event_data->>'source_id'=ANY($2::text[])
         AND (COALESCE(c.tracker_client_id,(to_jsonb(e)->>'tracker_client_id')::int) IS DISTINCT FROM $3::int
           OR COALESCE(c.tracker_page_id,e.tracker_page_id) IS DISTINCT FROM $4::int
           OR e.event_data->>'url' IS DISTINCT FROM $5)`,
      [EVENT, [...invitedChecks], clientId, pageId, url]);
    for (const row of rows) invitedChecks.delete(row.id);
  }
  for (const id of new Set([...directChecks, ...invitedChecks])) {
    const row = (await pool.query(
      `SELECT url,query,finished_at,summary,publication_history,contentscore_history,cached_from,
              jsonb_build_object('gsc_audit_evidence',report->'gsc_audit_evidence') AS report
           FROM growth_free_checks WHERE id=$1 AND status='DONE'`, [id])).rows[0];
    if (!row || !exact(row.url, url)) continue;
    const canReadResearch = await require('./growth-free/gsc-audit-handoff.cjs').auditResearchAvailable(pool,{...row,id});
    const { report, cached_from, ...proof } = row;
    const gsc = (await growth.listGscUploads(pool, id)).filter(item => item.status === 'VERIFIED_FOR_PAGE');
    const ai = (canReadResearch ? await growth.listAiAnswerObservations(pool, id) : []).map(({ engine, parsed, created_at }) => ({
      engine, recorded_at: created_at, source_status: parsed?.resources_status ?? null,
      exact_url_listed: parsed?.sources_verifiable === true ? (parsed.sources || []).some(source => exact(source, url)) : null
    }));
    out.free_growth.push({ ...proof, summary: canReadResearch ? proof.summary : null, gsc, ai });
  }
  return { tracker_client_id: clientId, tracker_page_id: pageId, url, ...out };
}

async function ownedPage(db, token, pageId, lock = false) {
  if (!/^\d{1,10}$/.test(pageId) || Number(pageId) > 2147483647) return null;
  const { rows: [page] } = await db.query(
    `SELECT p.id,p.url,p.tracker_client_id
       FROM tracker_pages p JOIN tracker_clients c ON c.id=p.tracker_client_id
      WHERE c.token=$1 AND c.status IS DISTINCT FROM 'deleted' AND p.id=$2` +
      (lock ? ' FOR UPDATE OF p' : ''), [token, pageId]);
  return page;
}

async function loadPageProofSources(pool, page) {
  const url = exactUrl(page.url);
  const { rows: events } = await pool.query(
    `SELECT e.event_type,e.event_data
       FROM tracker_case_study_events e LEFT JOIN tracker_case_studies c ON c.id=e.case_study_id
      WHERE e.event_type=$4 AND e.event_data->>'url'=$3
        AND COALESCE(c.tracker_client_id,(to_jsonb(e)->>'tracker_client_id')::int)=$1
        AND COALESCE(c.tracker_page_id,e.tracker_page_id)=$2
      ORDER BY e.event_at,e.id`, [page.tracker_client_id, page.id, url, EVENT]);
  return loadProofSources(pool, { clientId: page.tracker_client_id, pageId: page.id, url, events });
}

const PROOF_EVENTS_SCHEMA = `
  SET LOCAL lock_timeout = '5s';
  ALTER TABLE tracker_case_study_events
    ADD COLUMN IF NOT EXISTS tracker_client_id INTEGER,
    ALTER COLUMN case_study_id DROP NOT NULL
`;

function registerProofSourceRoutes(app, pool, { ensureCaseSchema } = {}) {
  const path = '/api/tracker-client/:token/pages/:pageId';
  let schemaReady;
  function ensureProofSchema() {
    if (!schemaReady) schemaReady = (async () => {
      if (ensureCaseSchema) await ensureCaseSchema();
      await pool.query(PROOF_EVENTS_SCHEMA);
    })().catch(error => { schemaReady = null; throw error; });
    return schemaReady;
  }
  app.get(path + '/proof-sources', async (req, res) => {
    try {
      const page = await ownedPage(pool, req.params.token, req.params.pageId);
      if (!page) return res.status(404).json({ success: false });
      const proof_sources = await loadPageProofSources(pool, page);
      return res.set('Cache-Control', 'no-store').json({ success: true, proof_sources });
    } catch (error) {
      console.error('[tracker-proof-source]', error.code || error.name);
      return res.status(503).json({ success: false });
    }
  });
  app.post([path + '/case-study/proof-sources', path + '/proof-sources'], async (req, res) => {
    const { type, id, key } = req.body || {};
    if (!TYPES.has(type) || typeof key !== 'string' || !key || key.length > 128 ||
        (type === 'free_growth' && (typeof id !== 'string' || !id || id.length > 40))) {
      return res.status(400).json({ success: false });
    }
    let db;
    let committed = false;
    try {
      const page = await ownedPage(pool, req.params.token, req.params.pageId);
      if (!page) return res.status(404).json({ success: false });
      const url = exactUrl(page.url);
      const source = type === 'free_growth' ? (await pool.query(
        "SELECT id,url,access_key FROM growth_free_checks WHERE public_id=$1 AND status='DONE'", [id])).rows[0]
        : await openReport(pool, key, { count: false });
      const permitted = source && (type === 'free_growth'
        ? growth.sameKey(source.access_key, key) && exact(source.url, url)
        : auditPageEvidence(source.report, url));
      if (!permitted) return res.status(404).json({ success: false });
      await ensureProofSchema();
      db = await pool.connect();
      await db.query('BEGIN');
      const ref = { type, source_id: String(source.id), url };
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [EVENT + ':' + type + ':' + ref.source_id]);
      const current = await ownedPage(db, req.params.token, req.params.pageId, true);
      if (!current || current.tracker_client_id !== page.tracker_client_id || current.url !== page.url) {
        return res.status(409).json({ success: false });
      }
      const existing = (await db.query(
        `SELECT COALESCE(c.tracker_client_id,e.tracker_client_id) AS tracker_client_id,
                COALESCE(c.tracker_page_id,e.tracker_page_id) AS tracker_page_id,e.event_data->>'url' AS url
           FROM tracker_case_study_events e LEFT JOIN tracker_case_studies c ON c.id=e.case_study_id
          WHERE e.event_type=$1 AND e.event_data->>'type'=$2 AND e.event_data->>'source_id'=$3`,
        [EVENT, type, ref.source_id])).rows;
      if (existing.some(link => link.tracker_client_id !== page.tracker_client_id ||
        (link.url === url && link.tracker_page_id !== page.id))) {
        return res.status(409).json({ success: false });
      }
      if (!existing.some(link => link.url === url && link.tracker_page_id === page.id)) {
        await db.query(`INSERT INTO tracker_case_study_events(tracker_client_id,tracker_page_id,event_type,source,event_data)
                        VALUES($1,$2,$3,$4,$5::jsonb)`, [page.tracker_client_id, page.id, EVENT, type, JSON.stringify(ref)]);
      }
      await db.query('COMMIT');
      committed = true;
      res.set('Cache-Control', 'no-store').json({ success: true });
    } catch (error) {
      console.error('[tracker-proof-source]', error.code || error.name);
      res.status(500).json({ success: false });
    } finally {
      if (db) {
        let error;
        try { if (!committed) await db.query('ROLLBACK'); } catch (failure) { error = failure; }
        db.release(error);
      }
    }
  });
}

module.exports = { EVENT, auditPageEvidence, loadProofSources, loadPageProofSources, registerProofSourceRoutes };
