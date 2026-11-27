'use strict';

const { exactUrl } = require('./implementation-report.cjs');
const { openReport } = require('./gsc-report/store.cjs');
const growth = require('./growth-free/store.cjs');
const { relatedChecks } = require('./growth-free/contentscore.cjs');

const EVENT = 'proof_source_linked';
const NETWORK_AI = 'network_ai';
const NETWORK_RELEASE = 'proof_source_released';
const NETWORK_REVOKE = 'proof_source_revoked';
const TYPES = new Set(['free_growth', 'gsc_audit', 'quick_scan']);
const EXPORT_SOURCES = new Set(['EXPORT', 'PAGE_EXPORT', 'PAGE_QUERY_EXPORT']);
const exact = (value, url) => {
  try { return exactUrl(value) === url; } catch { return false; }
};
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const history = value => Array.isArray(value) ? value : value ? [value] : [];

function quickScanEvidence(row, url) {
  const result = row?.scan_result;
  if (!result || !row.scan_completed_at || !exact(row.url, url) ||
      (result.url && !exact(result.url, url)) || result.success === false) return null;
  return { url, score: numeric(result.score), scanned_at: row.scan_completed_at };
}

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

async function loadNetworkAi(pool, page, ref) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT event_type,event_data FROM tracker_case_study_events
      WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND event_type IN ($5,$6)
        AND source=$7 AND event_data->>'source_id'=$3 AND event_data->>'url'=$4
      ORDER BY id DESC LIMIT 1
    )
    SELECT e.id::text,e.published_url,e.created_at AS recorded_at,
      e.metadata->>'engine' AS engine,e.metadata->>'observed_at' AS observed_at,
      e.metadata->>'publication_version_id' AS publication_version_id,
      e.metadata->>'publication_revision' AS publication_revision,
      CASE WHEN e.metadata->'exact_page_cited'='true'::jsonb THEN true END AS exact_page_cited,
      'manual_admin' AS observation_source
    FROM latest
    JOIN network_placement_review_events e
      ON e.placement_id=$3::bigint AND e.published_url=$4 AND e.id<=(latest.event_data->>'last_event_id')::bigint
    JOIN network_placements p ON p.id=e.placement_id
    WHERE latest.event_type=$5 AND e.event_type='ai_observation' AND e.actor_type='admin'
      AND e.metadata->>'publisher_website_id'=p.publisher_website_id::text
      AND p.publisher_website_id::text=latest.event_data->>'publisher_website_id'
      AND e.metadata->>'publication_version_id'=latest.event_data->>'publication_version_id'
      AND e.metadata->>'publication_revision' IS NOT NULL
    ORDER BY e.created_at DESC,e.id DESC`, [page.clientId, page.pageId, ref.source_id, ref.url,
    NETWORK_RELEASE, NETWORK_REVOKE, NETWORK_AI]);
  return rows;
}

async function loadProofSources(pool, { clientId, pageId, url, events }) {
  const out = { free_growth: [], gsc_audit: [], quick_scan: [], prospect_research: [], network_ai: [] };
  const directChecks = new Set();
  const invitedChecks = new Set();
  for (const event of events) {
    const ref = event.event_data;
    if (event.event_type !== EVENT || ref?.url !== url) continue;
    if (ref.type === NETWORK_AI) {
      out.network_ai.push(...await loadNetworkAi(pool, { clientId, pageId }, ref));
    } else if (!TYPES.has(ref.type)) continue;
    else if (ref.type === 'gsc_audit') {
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
    } else if (ref.type === 'quick_scan') {
      const { rows: [row] } = await pool.query(`SELECT url,scan_result,scan_completed_at,
          to_jsonb(s)->>'ceo_report_token' AS ceo_report_token,to_jsonb(s)->>'ceo_report_page_url' AS ceo_report_page_url,
          to_jsonb(s)->>'audit20_report_url' AS audit20_report_url,to_jsonb(s)->>'audit20_status' AS audit20_status
        FROM prospect_quick_scans s WHERE id=$1 AND revoked_at IS NULL`, [ref.source_id]);
      const evidence = quickScanEvidence(row, url);
      if (evidence) {
        out.quick_scan.push(evidence);
        out.prospect_research.push(...await require('./prospect-research-proof.cjs').prospectResearch(pool, row, url));
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
      `SELECT url,query,finished_at,summary,publication_history,contentscore_history,to_jsonb(c)->>'cached_from' AS cached_from,
              jsonb_build_object('gsc_audit_evidence',to_jsonb(c)->'report'->'gsc_audit_evidence') AS report
           FROM growth_free_checks c WHERE id=$1 AND status='DONE'`, [id])).rows[0];
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

async function bindProofSource(db, page, type, sourceId, url) {
  const ref = { type, source_id: String(sourceId), url };
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [EVENT + ':' + type + ':' + ref.source_id]);
  const existing = (await db.query(
    `SELECT COALESCE(c.tracker_client_id,e.tracker_client_id) AS tracker_client_id,
            COALESCE(c.tracker_page_id,e.tracker_page_id) AS tracker_page_id,e.event_data->>'url' AS url
       FROM tracker_case_study_events e LEFT JOIN tracker_case_studies c ON c.id=e.case_study_id
      WHERE e.event_type=$1 AND e.event_data->>'type'=$2 AND e.event_data->>'source_id'=$3`,
    [EVENT, type, ref.source_id])).rows;
  if (existing.some(link => link.tracker_client_id !== page.tracker_client_id ||
    (link.url === url && link.tracker_page_id !== page.id))) {
    return false;
  }
  if (!existing.some(link => link.url === url && link.tracker_page_id === page.id)) {
    await db.query(`INSERT INTO tracker_case_study_events(tracker_client_id,tracker_page_id,event_type,source,event_data)
                    VALUES($1,$2,$3,$4,$5::jsonb)`, [page.tracker_client_id, page.id, EVENT, type, JSON.stringify(ref)]);
  }
  return true;
}

// The caller holds the Network placement lock for both grant and revocation.
async function releaseNetworkAi(db, { placementId, url, edition, trackerToken, trackerPageId }) {
  const page = await ownedPage(db, trackerToken, trackerPageId, true);
  if (!page) return 404;
  if (!exact(page.url, url) || !await bindProofSource(db, page, NETWORK_AI, placementId, url)) return 409;
  const { rows: [{ last_event_id }] } = await db.query(`SELECT COALESCE(MAX(id),0)::text AS last_event_id
    FROM network_placement_review_events WHERE placement_id=$1 AND event_type='ai_observation' AND published_url=$2`,
    [placementId, url]);
  const ref = { type: NETWORK_AI, source_id: String(placementId), url, ...edition, last_event_id };
  const { rows: [latest] } = await db.query(`SELECT event_type,event_data=$6::jsonb AS unchanged
    FROM tracker_case_study_events WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND source=$3
      AND event_type IN ($4,$5) AND event_data->>'source_id'=$6::jsonb->>'source_id'
      AND event_data->>'url'=$6::jsonb->>'url'
    ORDER BY id DESC LIMIT 1`, [page.tracker_client_id, page.id, NETWORK_AI, NETWORK_RELEASE, NETWORK_REVOKE, JSON.stringify(ref)]);
  if (latest?.event_type !== NETWORK_RELEASE || !latest.unchanged) {
    await db.query(`INSERT INTO tracker_case_study_events(tracker_client_id,tracker_page_id,event_type,source,event_data)
      VALUES ($1,$2,$3,$4,$5::jsonb)`, [page.tracker_client_id, page.id, NETWORK_RELEASE, NETWORK_AI, JSON.stringify(ref)]);
  }
  return 200;
}

async function revokeNetworkAi(db, placementId) {
  await db.query(`INSERT INTO tracker_case_study_events(tracker_client_id,tracker_page_id,event_type,source,event_data)
    SELECT tracker_client_id,tracker_page_id,$3,$2,event_data FROM (
      SELECT DISTINCT ON (tracker_client_id,tracker_page_id,event_data->>'url') tracker_client_id,tracker_page_id,event_type,event_data
      FROM tracker_case_study_events WHERE source=$2 AND event_type IN ($3,$4) AND event_data->>'source_id'=$1
      ORDER BY tracker_client_id,tracker_page_id,event_data->>'url',id DESC
    ) AS latest WHERE event_type=$4`, [String(placementId), NETWORK_AI, NETWORK_REVOKE, NETWORK_RELEASE]);
}

async function linkFreeGrowthProof(pool,{token,url,checkId,ensureCaseSchema}){
 if(!/^[a-f0-9]{48}$/i.test(token))return null;
 const findPage=async(db,lock=false)=>{
   const {rows}=await db.query(`SELECT p.id,p.url,p.tracker_client_id FROM tracker_pages p
     JOIN tracker_clients c ON c.id=p.tracker_client_id
     WHERE c.token=$1 AND c.status IS DISTINCT FROM 'deleted' AND p.url=$2
     LIMIT 2`+(lock?' FOR UPDATE OF p,c':''),[token,url]);
   return rows.length===1?rows[0]:null;
 };
 if(!await findPage(pool))return null;
 await ensureProofSourceSchema(pool,ensureCaseSchema);
 const db=await pool.connect();
 let broken;
 try{
  await db.query('BEGIN');
  const page=await findPage(db,true);
  if(!page||!await bindProofSource(db,page,'free_growth',checkId,url)){
   await db.query('ROLLBACK');
   return null;
  }
  await db.query('COMMIT');
  return '/track/'+encodeURIComponent(token)+'?page='+page.id;
 }catch(error){
  try{await db.query('ROLLBACK');}catch(e){broken=e;}
  throw error;
 }finally{db.release(broken);}
}

async function quickScanForRegistration(db, token, domain) {
  const { rows: [scan] } = await db.query(`SELECT id,url,scan_result,scan_completed_at
    FROM prospect_quick_scans WHERE token=$1 AND tracker_interested IS TRUE AND audit20_status='ready'
      AND revoked_at IS NULL FOR SHARE`, [token]);
  if (!scan) return null;
  let url;
  try { url = exactUrl(scan.url); } catch { return null; }
  const host = new URL(url).hostname.replace(/^www[.]/, '');
  return host === domain && quickScanEvidence(scan, url) ? { id: scan.id, url } : null;
}

async function registerQuickScanProof(db, clientId, scan) {
  const { rows: [page] } = await db.query(`INSERT INTO tracker_pages
    (tracker_client_id,url,check_frequency,next_check_at,email_reminders,next_ai_reminder_at)
    VALUES ($1,$2,'0',NULL,FALSE,NULL) RETURNING id,tracker_client_id`, [clientId, scan.url]);
  return await bindProofSource(db, page, 'quick_scan', scan.id, scan.url) ? page.id : null;
}

async function ensureProofSourceSchema(pool, ensureCaseSchema) {
  if (ensureCaseSchema) await ensureCaseSchema();
  await pool.query(PROOF_EVENTS_SCHEMA);
}

function registerProofSourceRoutes(app, pool, { ensureCaseSchema, resolveQuickScanToken } = {}) {
  const path = '/api/tracker-client/:token/pages/:pageId';
  let schemaReady;
  function ensureProofSchema() {
    if (!schemaReady) schemaReady = ensureProofSourceSchema(pool, ensureCaseSchema)
      .catch(error => { schemaReady = null; throw error; });
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
      let source;
      if (type === 'free_growth') {
        const { rows: [check] } = await pool.query(
          "SELECT id,url,access_key FROM growth_free_checks WHERE public_id=$1 AND status='DONE'", [id]);
        if (check && growth.sameKey(check.access_key, key) && exact(check.url, url)) source = check;
      } else if (type === 'gsc_audit') {
        const report = await openReport(pool, key, { count: false });
        if (report && auditPageEvidence(report.report, url)) source = report;
      } else {
        const scanToken = /^[a-f0-9]{16}$/i.test(key) && resolveQuickScanToken ? await resolveQuickScanToken(key) : key;
        if (scanToken) {
          const { rows: [scan] } = await pool.query(`SELECT id,url,scan_result,scan_completed_at
            FROM prospect_quick_scans WHERE token=$1 AND revoked_at IS NULL`, [scanToken]);
          if (quickScanEvidence(scan, url)) source = scan;
        }
      }
      if (!source) return res.status(404).json({ success: false });
      await ensureProofSchema();
      db = await pool.connect();
      await db.query('BEGIN');
      const current = await ownedPage(db, req.params.token, req.params.pageId, true);
      if (!current || current.tracker_client_id !== page.tracker_client_id || current.url !== page.url) {
        return res.status(409).json({ success: false });
      }
      if (!await bindProofSource(db, page, type, source.id, url)) return res.status(409).json({ success: false });
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

module.exports = { linkFreeGrowthProof, EVENT, auditPageEvidence, loadProofSources, loadPageProofSources, registerProofSourceRoutes,
  ensureProofSourceSchema, quickScanForRegistration, registerQuickScanProof, releaseNetworkAi, revokeNetworkAi };
