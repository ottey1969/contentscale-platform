'use strict';

const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { exactUrl } = require('../implementation-report.cjs');

const path = '/api/network/admin/publications/:placementId/post-publication-ai';
const eventType = 'ai_observation';
const engines = new Set(['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot']);
const reviewTypes = "'submitted','resubmitted','precheck_passed','precheck_needs_review','needs_changes','rejected','verified','ai_observation'";

async function hasObservationSchema(db) {
  const { rows: [row] } = await db.query(`SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid=to_regclass('network_placement_review_events')
      AND conname='network_placement_review_events_event_type_check'`);
  return Boolean(row?.definition.includes(eventType));
}

async function ensureObservationEventType(client) {
  if (await hasObservationSchema(client)) return;
  await client.query(`ALTER TABLE network_placement_review_events
    DROP CONSTRAINT IF EXISTS network_placement_review_events_event_type_check,
    ADD CONSTRAINT network_placement_review_events_event_type_check CHECK (event_type IN (${reviewTypes}))`);
}

function parseObservation(body) {
  const { engine, google_source: googleSource, observed_at: observedAt, evidence, query, published_url: publishedUrl,
    citation_urls: citationUrls } = body || {};
  if (!engines.has(engine)) throw new Error('Choose the observed AI system.');
  if (engine === 'google_aio' && !['ai_overview','gemini'].includes(googleSource)) throw new Error('Choose the observed Google source.');
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('Enter the observed query.');
  if (typeof evidence !== 'string' || !evidence.trim() || evidence.length > 12000 || evidence.includes('\0')) {
    throw new Error('Enter the actual answer or observation, up to 12,000 characters.');
  }
  if (typeof observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(observedAt)) {
    throw new Error('Enter the observation time with a time zone.');
  }
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) throw new Error('The observation time must be in the past.');
  if (!Array.isArray(citationUrls) || citationUrls.length > 30) throw new Error('Provide at most 30 observed citation URLs.');
  const url = exactUrl(publishedUrl);
  const citations = [...new Set(citationUrls.map(exactUrl))].sort();
  return {
    published_url: url, observed_at: new Date(timestamp).toISOString(), engine,
    ...(engine === 'google_aio' ? { google_source: googleSource } : {}),
    query: query.trim(), evidence: evidence.trim(), citation_urls: citations,
    exact_page_cited: citations.includes(url) ? true : null
  };
}

function registerPostPublicationAi({ app, pool, verifyAdmin, wrap, ensureSchema }) {
  app.get('/network/publishing/:placementId/post-publication-ai', (_req, res) =>
    res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow')
      .sendFile(resolve(__dirname, '../../public/network-post-publication-ai.html')));
  let ready;
  const prepareSchema = () => {
    if (!ready) {
      ready = (async () => {
        if (!await hasObservationSchema(pool)) await ensureSchema(pool);
      })().catch(error => { ready = undefined; throw error; });
    }
    return ready;
  };

  app.get(path, verifyAdmin, wrap(async (req, res) => {
    const id = Number(req.params.placementId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid placement' });
    const { rows: [placement] } = await pool.query('SELECT status,published_url,verified_at FROM network_placements WHERE id=$1', [id]);
    if (!placement) return res.status(404).json({ error: 'Placement not found' });
    const { rows } = await pool.query(`SELECT id,published_url,metadata,created_at
      FROM network_placement_review_events WHERE placement_id=$1 AND event_type='ai_observation'
      ORDER BY created_at DESC,id DESC LIMIT 100`, [id]);
    res.set('Cache-Control','no-store').json({
      can_record: placement.status === 'verified' && Boolean(placement.published_url && placement.verified_at),
      published_url: placement.published_url,
      observations: rows.map(({ id: eventId, published_url, created_at, metadata }) => {
        const { observation_key, ...observation } = metadata;
        return { id: eventId, published_url, created_at, ...observation };
      })
    });
  }));

  app.post(path, verifyAdmin, wrap(async (req, res) => {
    const id = Number(req.params.placementId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid placement' });
    let observation;
    try { observation = parseObservation(req.body); }
    catch (error) { return res.status(422).json({ error: error.message }); }
    await prepareSchema();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [placement] } = await client.query(`SELECT p.status,p.published_url,p.submitted_at,p.verified_at,
        pv.id AS publication_version_id FROM network_placements p
        LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
        WHERE p.id=$1 FOR UPDATE OF p`, [id]);
      if (!placement) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Placement not found' });
      }
      let currentUrl;
      try { currentUrl = exactUrl(placement.published_url); } catch {}
      if (placement.status !== 'verified' || !placement.verified_at || !placement.publication_version_id ||
          currentUrl !== observation.published_url) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This observation requires the exact URL of the currently verified edition.' });
      }
      if (Date.parse(observation.observed_at) < Number(placement.submitted_at || placement.verified_at)) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'The observation must follow the publication submission.' });
      }
      const { published_url, ...data } = observation;
      const metadata = { ...data, verified_at: placement.verified_at, publication_version_id: placement.publication_version_id };
      metadata.observation_key = createHash('sha256').update(JSON.stringify([published_url, metadata])).digest('hex');
      const { rows: [existing] } = await client.query(`SELECT id FROM network_placement_review_events
        WHERE placement_id=$1 AND event_type='ai_observation' AND metadata->>'observation_key'=$2`, [id, metadata.observation_key]);
      const saved = existing || (await client.query(`INSERT INTO network_placement_review_events
        (placement_id,event_type,actor_type,actor_ref,published_url,metadata)
        VALUES ($1,'ai_observation','admin',$2,$3,$4::jsonb) RETURNING id`,
      [id, String(req.admin?.id || 'admin').slice(0, 200), published_url, JSON.stringify(metadata)])).rows[0];
      await client.query('COMMIT');
      res.status(existing ? 200 : 201).json({ id: saved.id, published_url, exact_page_cited: data.exact_page_cited });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }));
}

module.exports = { ensureObservationEventType, registerPostPublicationAi };
