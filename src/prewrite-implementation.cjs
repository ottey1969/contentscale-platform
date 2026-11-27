'use strict';

const { isDeepStrictEqual } = require('node:util');
const { parse } = require('parse5');
const { jsonLd } = require('./growth-free/schema-help.cjs');

const { createHash } = require('node:crypto');
const { fetchPublicGrowthHtml } = require('./growth-public-html-reader.cjs');
const { renderPublicGrowthPage } = require('./growth-safe-browser-renderer.cjs');
const { isBotCheck } = require('./gsc-report/site-audit.cjs');
const { VERSION, exactUrl, parseImplementationReport, ownerReport } = require('./implementation-report.cjs');

function resolveTarget(brief, domain) {
  if (typeof domain !== 'string' || !domain.trim()) throw new Error('The Tracker website is missing');
  const site = new URL(exactUrl(/^https?:\/\//i.test(domain) ? domain : 'https://' + domain));
  const decision = brief.content_decision || {};
  const treatment = String(decision.recommended_treatment || '').toUpperCase();
  if (treatment === 'CREATE_NEW_PAGE') {
    const slug = String(brief.meta_package?.url_slug || '').replace(/^\/(?!\/)/, '').replace(/\/$/, '');
    if (!slug || !slug.split('/').every(part => /^[\p{L}\p{N}_-]+$/u.test(part))) {
      throw new Error('The approved Brief needs a valid page slug');
    }
    return { mode: 'CREATE', url: new URL('/' + slug + '/', site).href };
  }
  if (['EXPAND_EXISTING_PAGE', 'OPTIMIZE_EXISTING_PAGE'].includes(treatment)) {
    const url = new URL(exactUrl(decision.closest_existing_url));
    if (url.hostname.replace(/^www\./, '') !== site.hostname.replace(/^www\./, '') || url.port !== site.port || url.search) {
      throw new Error('The approved target must belong to this Tracker website');
    }
    return { mode: treatment === 'EXPAND_EXISTING_PAGE' ? 'EXPAND' : 'OPTIMIZE', url: url.href };
  }
  throw new Error('The Brief needs an approved page decision');
}

function readReport(raw, brief, domain, language) {
  const target = resolveTarget(brief, domain);
  const report = parseImplementationReport(raw, target.url);
  return { target, report, owner_report: ownerReport(report, language) };
}

function publicationReport(raw, brief, domain, language) {
  const result = readReport(raw, brief, domain, language);
  if (result.report.status !== 'published') throw new Error('An explicit publication report is required');
  return result;
}

function editorInstructions(brief, domain) {
  const { mode, url } = resolveTarget(brief, domain);
  const actions = (Array.isArray(brief.surgical_changes) ? brief.surgical_changes : [])
    .filter(item => typeof item?.change === 'string')
    .map(item => '- ' + [item.where, item.change].filter(value => typeof value === 'string').join(': '));
  return [
    mode + ' ' + url,
    mode === 'CREATE' ? 'Create the page using the approved blueprint below.' :
      'Edit the existing page in place. Preserve content outside the approved changes.',
    ...actions,
    'Return the page content for approval. Perform CMS changes or publication only when authorized.',
    'After execution, return a separate JSON Implementation Report with schema "' + VERSION + '" and url "' + url + '".',
    'Set status to implemented when edits have been applied, not_published when publication has not occurred and edits are still a draft, or published only after confirmed publication.',
    'Include summary (actual changes, up to 500 characters), change_types (one or more of content, technical_seo, schema, geo, ux, general), and evidence (available editor evidence or null).',
    'Use published_at as the actual UTC timestamp YYYY-MM-DDTHH:mm:ssZ for confirmed publication, and null otherwise. Never infer publication, supply invented evidence, or claim independent verification.'
  ].join('\n');
}

const excludedText = new Set(['iframe', 'noscript', 'script', 'select', 'style', 'svg', 'template', 'textarea', 'title']);
const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const normalized = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const inlineHidden = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!\s*important\s*)?(?:;|$)/i;

function proofHtml(html, url) {
  const document = parse(html).childNodes.find(node => node.tagName === 'html');
  const head = document.childNodes.find(node => node.tagName === 'head');
  const body = document.childNodes.find(node => node.tagName === 'body');
  const metadata = head.childNodes;
  const title = metadata.find(node => node.tagName === 'title');
  const description = metadata.find(node => node.tagName === 'meta' && attribute(node, 'name')?.toLowerCase() === 'description');
  const canonical = metadata.find(node => node.tagName === 'link' && attribute(node, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'));
  const markup = {
    title: normalized(title?.childNodes.map(node => node.value || '').join('') || ''),
    description: normalized(attribute(description, 'content') || ''),
    canonical: null,
    nodes: []
  };
  const href = attribute(canonical, 'href');
  if (href) {
    try { markup.canonical = new URL(href, url).href; } catch {}
  }
  const text = [];
  let executableScripts = false;
  const pending = [body, ...metadata.filter(node => node.tagName === 'script')].filter(Boolean);
  while (pending.length) {
    const node = pending.pop();
    if (node.nodeName === '#text') {
      text.push(node.value);
      continue;
    }
    if (attribute(node, 'hidden') !== undefined || inlineHidden.test(attribute(node, 'style') || '')) continue;
    if (node.tagName === 'script') {
      const type = attribute(node, 'type')?.trim().toLowerCase() || '';
      if (type === 'application/ld+json') {
        const data = node.childNodes.map(item => item.value || '').join('');
        markup.nodes.push(...jsonLd('<script type="application/ld+json">' + data + '</script>').filter(item => item['@type']));
      } else if (['', 'module', 'text/javascript', 'application/javascript'].includes(type)) {
        executableScripts = true;
      }
    }
    if (excludedText.has(node.tagName)) continue;
    for (let i = (node.childNodes?.length || 0) - 1; i >= 0; i--) pending.push(node.childNodes[i]);
  }
  return { markup, text: normalized(text.join(' ')).toLowerCase(), executableScripts };
}

async function verifyApprovedContent(url, approvedHtml, fetchHtml, renderHtml) {
  const { text: draft, markup: expected } = proofHtml(approvedHtml, url);
  const fields = ['title', 'description', 'canonical'].filter(field => expected[field]);
  if (draft.length < 200 && !fields.length && !expected.nodes.length) return null;

  const live = await fetchHtml(url, { redirects: 0, limit: 2500000 });
  if (live.status !== 200 || live.final_url !== url || live.redirect_chain?.length || live.truncated || isBotCheck(live.html)) return null;
  const { text: liveText, markup: found, executableScripts } = proofHtml(live.html, url);
  const checks = Object.fromEntries(fields.map(field => [field, expected[field] === found[field]]));
  if (expected.nodes.length) {
    checks.json_ld = expected.nodes.every(node => found.nodes.some(candidate => isDeepStrictEqual(node, candidate)));
  }
  const includesDraft = text => (' ' + text + ' ').includes(' ' + draft + ' ');
  let contentPresent = draft.length >= 200 && includesDraft(liveText);
  let renderedEvidence = null;
  if (draft.length >= 200 && !contentPresent && executableScripts && renderHtml) {
    const { live: rendered } = await Promise.resolve().then(() => renderHtml(url, { verifyDocument: true })).catch(() => ({}));
    if (rendered?.status === 200 && rendered.final_url === url && !rendered.redirect_chain?.length &&
        !rendered.truncated && !isBotCheck(rendered.html) && typeof rendered.visible_text === 'string' &&
        Date.parse(rendered.retrieved_at) >= Date.parse(live.retrieved_at) && includesDraft(normalized(rendered.visible_text).toLowerCase())) {
      contentPresent = true;
      renderedEvidence = rendered;
    }
  }
  const matched = Object.values(checks);
  if (!contentPresent && !matched.includes(true)) return null;
  return {
    status: contentPresent ? 'approved_content_present' :
      matched.every(Boolean) ? 'approved_markup_present' : 'approved_markup_partially_present',
    url,
    observed_at: (renderedEvidence || live).retrieved_at,
    source: renderedEvidence ? 'LIVE_PUBLIC_BROWSER_RENDERED' : 'LIVE_PUBLIC_HTTPS',
    ...(renderedEvidence && matched.length ? { markup_source: 'LIVE_PUBLIC_HTTPS', markup_observed_at: live.retrieved_at } : {}),
    ...(draft.length >= 200 ? { content_check: contentPresent } : {}),
    ...(contentPresent ? { content_hash: createHash('sha256').update(draft).digest('hex') } : {}),
    ...(matched.length ? { markup_checks: checks } : {})
  };
}

module.exports = { resolveTarget, readReport, publicationReport, editorInstructions, verifyApprovedContent };

function response(result, trackerPageId) {
  return {
    success: true, ...result, status: result.report.status, tracker_page_id: trackerPageId,
    published_url: trackerPageId ? result.report.url : null, tracker_entered: Boolean(trackerPageId)
  };
}

function registerRoutes(app, pool, resolveBrief, { fetchHtml = fetchPublicGrowthHtml, renderHtml = renderPublicGrowthPage, publicPath } = {}) {
  const path = publicPath || '/api/tracker-client/:token/prewrite-brief/:id';
  const owner = publicPath ? 'b.public_site AS domain' : 'c.domain';
  const join = publicPath ? '' : 'JOIN tracker_clients c ON c.id=b.client_id';
  const condition = publicPath ? 'b.client_id IS NOT DISTINCT FROM $2 AND b.public_access_hash IS NOT NULL' : 'b.client_id=$2';
  const updateScope = publicPath ? 'client_id IS NOT DISTINCT FROM $2 AND public_access_hash IS NOT NULL' : 'client_id=$2';
  async function save(req, res, publishing) {
    let db;
    let committed = false;
    try {
      const scope = await resolveBrief(req.params.token, req.params.id, req);
      if (scope.error) return res.status(scope.code).json({ success: false, error: scope.error });
      db = await pool.connect();
      await db.query('BEGIN');
      const { rows: [row] } = await db.query(
        `SELECT b.status, b.keyword, b.brief_json, b.language, b.tracker_page_id,
                b.implementation_reports, ${owner}
           FROM prewrite_briefs b ${join}
          WHERE b.id=$1 AND ${condition} FOR UPDATE OF b`, [scope.briefId, scope.clientId]);
      if (!row || !['approved', 'published'].includes(row.status)) {
        return res.status(409).json({ success: false, error: 'The Brief requires lead approval' });
      }
      let result;
      try {
        const parse = publishing ? publicationReport : readReport;
        result = parse(req.body?.report, row.brief_json, row.domain, row.language);
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const { target, report } = result;
      const reports = row.implementation_reports || [];
      const serializedReport = JSON.stringify(report);
      const seen = (await db.query(
        "SELECT 1 FROM jsonb_array_elements($1::jsonb) entry WHERE entry->'report'=$2::jsonb",
        [JSON.stringify(reports), serializedReport])).rowCount > 0;
      if (seen) {
        await db.query('COMMIT');
        committed = true;
        return res.json(response(result, publishing ? row.tracker_page_id : null));
      }
      if (row.status === 'published' || (!publishing && report.status === 'published')) {
        return res.status(409).json({ success: false, error: 'Confirm a publication through the publication action for an approved Brief' });
      }

      let trackerPageId = null;
      if (publishing && !publicPath) {
        const intent = row.brief_json.search_intent?.primary || row.brief_json.search_intent;
        const values = [scope.clientId, target.url, row.keyword, typeof intent === 'string' ? intent : null, scope.briefId];
        const inserted = await db.query(
          `INSERT INTO tracker_pages (tracker_client_id,url,keyword,intent,check_frequency,next_check_at,
                                      is_active,implementation_status,prewrite_brief_id,created_at)
           VALUES ($1,$2,$3,$4,'weekly',NOW(),TRUE,'baseline_pending',$5,NOW())
           ON CONFLICT (tracker_client_id,url) WHERE tracker_client_id IS NOT NULL DO NOTHING
           RETURNING id`, values);
        const page = inserted.rows[0] || (await db.query(
          'SELECT id FROM tracker_pages WHERE tracker_client_id=$1 AND url=$2', values.slice(0, 2))).rows[0];
        trackerPageId = page.id;
        await db.query(
          "UPDATE prewrite_briefs SET status='published', published_at=$3, published_url=$4, tracker_page_id=$5 WHERE id=$1 AND client_id=$2",
          [scope.briefId, scope.clientId, report.published_at, report.url, trackerPageId]);
      }
      if (publishing && publicPath) {
        await db.query(`UPDATE prewrite_briefs SET status='published', published_at=$3, published_url=$4
          WHERE id=$1 AND ${updateScope}`, [scope.briefId, scope.clientId, report.published_at, report.url]);
      }
      await db.query(
        `UPDATE prewrite_briefs SET implementation_reports=implementation_reports ||
            jsonb_build_array(jsonb_build_object('recorded_at',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                                                 'report',$3::jsonb))
          WHERE id=$1 AND ${updateScope}`, [scope.briefId, scope.clientId, serializedReport]);
      await db.query('COMMIT');
      committed = true;
      return res.json(response(result, trackerPageId));
    } catch (error) {
      console.error('[prewrite-implementation]', error.message);
      return res.status(500).json({ success: false, error: 'Could not save the implementation report' });
    } finally {
      if (db) {
        let rollbackError;
        try { if (!committed) await db.query('ROLLBACK'); } catch (error) { rollbackError = error; }
        db.release(rollbackError);
      }
    }
  }
  app.get(path + '/implementation-report', async (req, res) => {
    try {
      const scope = await resolveBrief(req.params.token, req.params.id, req);
      if (scope.error) return res.status(scope.code).json({ success: false, error: scope.error });
      const { rows: [row] } = await pool.query(
        `SELECT b.brief_json, b.language, b.implementation_reports, ${owner}
           FROM prewrite_briefs b ${join}
          WHERE b.id=$1 AND ${condition}`, [scope.briefId, scope.clientId]);
      if (!row) return res.status(404).json({ success: false, error: 'Brief not found' });
      let instructions = null;
      try { instructions = editorInstructions(row.brief_json, row.domain); } catch {}
      const { keyword, content_decision, search_intent, meta_package, ai_answer, opening_passage, page_blueprint, fact_safety } = row.brief_json;
      res.set('Cache-Control', 'no-store').json({
        success: true, instructions,
        editor_brief: { keyword, content_decision, search_intent, meta_package, ai_answer, opening_passage, page_blueprint, fact_safety },
        history: row.implementation_reports.map(item => ({
          ...item, owner_report: ownerReport(item.report, row.language)
        }))
      });
    } catch (error) {
      console.error('[prewrite-implementation]', error.message);
      res.status(500).json({ success: false, error: 'Could not load the implementation reports' });
    }
  });
  const trackerPageJoin = publicPath ? '' : `JOIN tracker_pages p
             ON p.id=b.tracker_page_id AND p.tracker_client_id=b.client_id AND p.url=b.published_url`;
  app.post(path + '/verify-live', async (req, res) => {
    try {
      const scope = await resolveBrief(req.params.token, req.params.id, req);
      if (scope.error) return res.status(scope.code).json({ success: false, error: scope.error });
      const ids = [scope.briefId, scope.clientId];
      const { rows: [row] } = await pool.query(
        `SELECT b.specialist_html, b.published_at, b.published_url, b.implementation_reports
           FROM prewrite_briefs b ${trackerPageJoin}
          WHERE b.id=$1 AND ${condition} AND b.status='published'`, ids);
      const index = row?.implementation_reports.findIndex(item => item.report.status === 'published') ?? -1;
      if (index < 0 || !row.specialist_html) {
        return res.status(409).json({ success: false, status: 'verification_pending' });
      }
      const entry = row.implementation_reports[index];
      const previous = entry.live_verification;
      let verification = previous;
      if (!previous || previous.content_check === false || Object.values(previous.markup_checks || {}).includes(false)) {
        try {
          verification = await verifyApprovedContent(row.published_url, row.specialist_html, fetchHtml, renderHtml);
        } catch {
          return res.status(422).json({ success: false, status: 'verification_pending' });
        }
        if (!verification || !(Date.parse(verification.observed_at) >= Date.parse(row.published_at))) {
          return res.status(422).json({ success: false, status: 'verification_pending' });
        }
        if (previous && Date.parse(verification.observed_at) <= Date.parse(previous.observed_at)) {
          return res.status(409).json({ success: false, status: 'verification_pending' });
        }
        if (previous && verification.status === previous.status && verification.content_check === previous.content_check &&
          isDeepStrictEqual(verification.markup_checks, previous.markup_checks)) {
          return res.set('Cache-Control', 'no-store').json({ success: true, verification: previous });
        }
        const key = [String(index), 'live_verification'];
        const saved = await pool.query(
          `UPDATE prewrite_briefs SET implementation_reports=jsonb_set(
              CASE WHEN $9::jsonb IS NULL THEN implementation_reports ELSE
                jsonb_set(implementation_reports,ARRAY[$7::text,'live_verification_history'],
                  COALESCE(implementation_reports->$7::int->'live_verification_history','[]'::jsonb)||jsonb_build_array($9::jsonb))
              END,$3::text[],$4::jsonb)
            WHERE id=$1 AND ${updateScope} AND status='published' AND published_url=$5 AND specialist_html=$6
              AND implementation_reports->$7::int->'report'=$8::jsonb
              AND implementation_reports->$7::int->'live_verification' IS NOT DISTINCT FROM $9::jsonb
            RETURNING implementation_reports #> $3::text[] AS verification`,
          [...ids, key, JSON.stringify(verification), row.published_url, row.specialist_html, index,
            JSON.stringify(entry.report), previous ? JSON.stringify(previous) : null]);
        if (!saved.rowCount) {
          const current = await pool.query(
            `SELECT implementation_reports #> $3::text[] AS verification FROM prewrite_briefs
              WHERE id=$1 AND ${updateScope} AND status='published' AND published_url=$4`, [...ids, key, row.published_url]);
          verification = current.rows[0]?.verification;
        }
      }
      if (!verification) return res.status(409).json({ success: false, status: 'verification_pending' });
      res.set('Cache-Control', 'no-store').json({ success: true, verification });
    } catch (error) {
      console.error('[prewrite-live-verification]', error.message);
      res.status(500).json({ success: false, status: 'verification_pending' });
    }
  });
  app.post(path + '/implementation-report', (req, res) => save(req, res, false));
  app.post(path + '/publish', (req, res) => save(req, res, true));
}

module.exports.registerRoutes = registerRoutes;
