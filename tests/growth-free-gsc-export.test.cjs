'use strict';
// Free Growth: optional Search Console export upload. All exports below are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const g = require('../src/growth-free/gsc-export.cjs');
const { zip } = require('./helpers/zip.cjs');
const { readOnlySource, runFreeGrowthResearch } = require('../src/growth-free/engine.cjs');
const PAGE = 'https://nl.contentscale.site/seo-content-optimalisatie/';
const QUERIES_NL = 'Populairste zoekopdrachten,Klikken,Vertoningen,CTR,Positie\nseo content optimalisatie,3,"1.234","0,24%","12,5"\n"content, optimalisatie",1,400,0.25%,18.2\n';
const DATES_NL = 'Datum,Klikken,Vertoningen,CTR,Positie\n2026-10-01,2,900,0.2%,13.1\n2026-10-02,2,734,0.3%,12.0\n';

test('a ZIP export filtered on exactly this page is verified, in any language and number format', () => {
  const r = g.readGscExport({ fileName: 'Prestaties.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Dates.csv': DATES_NL, 'Filters.csv': 'Filter,Waarde\nZoektype,Web\nPagina,' + PAGE + '\n' }), pageUrl: PAGE });
  assert.equal(r.status, 'VERIFIED_FOR_PAGE'); assert.equal(r.basis, 'EXACT_PAGE_FILTER');
  assert.deepEqual(r.period, { start: '2026-10-01', end: '2026-10-02', days: 2 });
  assert.deepEqual([r.totals.clicks, r.totals.impressions, r.totals.position, r.totals.source], [4, 1634, 12.6, 'DATES']);
  assert.deepEqual(r.queries[0], { query: 'seo content optimalisatie', clicks: 3, impressions: 1234, ctr: 0.0024, position: 12.5 });
  assert.equal(r.queries[1].query, 'content, optimalisatie', 'a quoted comma stays in the search term');
  assert.equal(g.termInExport(r, 'SEO content optimalisatie').impressions, 1234);
  assert.equal(g.engineRows(r, { pageUrl: PAGE }).length, 2);
});

test('not verified: a partial page filter, another page, no filter, or several pages', () => {
  const partial = g.readGscExport({ fileName: 'x.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Filters.csv': 'Filter,Waarde\nPagina,URL bevat: ' + PAGE + '\n' }), pageUrl: PAGE });
  assert.equal(partial.status, 'NOT_VERIFIED_FOR_PAGE'); assert.equal(partial.basis, 'PARTIAL_PAGE_FILTER');
  assert.equal(g.readGscExport({ fileName: 'x.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Filters.csv': 'Filter,Value\nPage,https://nl.contentscale.site/other/\n' }), pageUrl: PAGE }).basis, 'OTHER_PAGE_FILTER');
  const csv = g.readGscExport({ fileName: 'Queries.csv', content: Buffer.from(QUERIES_NL), pageUrl: PAGE });
  assert.equal(csv.status, 'NOT_VERIFIED_FOR_PAGE'); assert.equal(csv.totals.source, 'QUERIES_SUM_UNDERCOUNTS');
  assert.deepEqual(g.engineRows(csv, { pageUrl: PAGE }), [], 'never used as evidence');
  const several = g.readGscExport({ fileName: 'x.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n' + PAGE + ',4,1634,0.24%,12.6\nhttps://nl.contentscale.site/other/,9,900,1%,8\n' }), pageUrl: PAGE });
  assert.equal(several.status, 'PAGE_TOTALS_ONLY'); assert.deepEqual([several.totals.clicks, several.totals.source], [4, 'PAGES']);
  const only = g.readGscExport({ fileName: 'x.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n' + PAGE + ',4,1634,0.24%,12.6\n' }), pageUrl: PAGE });
  assert.equal(only.status, 'VERIFIED_FOR_PAGE'); assert.equal(only.basis, 'ONLY_THIS_PAGE_IN_PAGES');
});

test('refused with a plain reason: empty, too large, not an export, no search terms', () => {
  assert.equal(g.readGscExport({ fileName: 'x.csv', content: Buffer.alloc(0), pageUrl: PAGE }).reason, 'EMPTY');
  assert.equal(g.readGscExport({ fileName: 'x.csv', content: Buffer.alloc(g.MAX_BYTES + 1), pageUrl: PAGE }).reason, 'TOO_LARGE');
  assert.equal(g.readGscExport({ fileName: 'x.zip', content: Buffer.from('PK not really a zip'), pageUrl: PAGE }).reason, 'NOT_A_ZIP');
  const none = g.readGscExport({ fileName: 'x.zip', content: zip({ 'Dates.csv': DATES_NL, 'Devices.csv': 'Device,Clicks\nMobile,3\n' }), pageUrl: PAGE });
  assert.equal(none.reason, 'NO_QUERIES'); assert.match(none.message, /Performance → Export/);
});

test('the research engine receives verified rows as page-verified Search Console data, read-only', async () => {
  const r = g.readGscExport({ fileName: 'x.zip', content: zip({ 'Queries.csv': QUERIES_NL, 'Filters.csv': 'Filter,Waarde\nPagina,' + PAGE + '\n' }), pageUrl: PAGE });
  const src = readOnlySource({ url: PAGE, keyword: 'seo content optimalisatie' }, { gscRows: g.engineRows(r, { pageUrl: PAGE }) });
  const page = await src.query("SELECT page_id,tracker_client_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 150");
  assert.equal(page.rows.length, 2); assert.equal(page.rows[0].evidence_scope, 'page_verified');
  const site = await src.query("SELECT page_id,query,clicks,impressions,position FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id<>$2 AND evidence_scope='page_verified'");
  assert.equal(site.rows.length, 0, 'no other pages');
  await assert.rejects(src.query('INSERT INTO tracker_gsc_queries(query) VALUES($1)'), /FREE_GROWTH_ENGINE_IS_READ_ONLY/);
  // End to end through the real research code: the report carries the uploaded search terms for this page.
  const own = '<html><head><title>SEO content optimalisatie</title></head><body><h1>SEO content optimalisatie</h1><h2>Wat het is</h2><p>' + 'TEST tekst over SEO content optimalisatie en zoekintentie. '.repeat(8) + '</p></body></html>';
  const out = await runFreeGrowthResearch({ url: PAGE, query: 'seo content optimalisatie', gscRows: g.engineRows(r, { pageUrl: PAGE }) }, { retryDelayMs: 0,
    judgeTasks: require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
    fetchLive: async u => { if (u !== PAGE) throw Object.assign(Error('x'), { code: 'PUBLIC_HTML_UNAVAILABLE' }); return { html: own, final_url: u, retrieved_at: new Date().toISOString(), truncated: false, source: 'LIVE_PUBLIC_HTTPS' }; },
    searchLive: async ({ query }) => ({ status: 'FRESH_GOOGLE_ORGANIC_LEADS', source: 'SERPER_GOOGLE_ORGANIC', query, leads: [], provider_attempts: ['SERPER_GOOGLE_ORGANIC'], checked_at: new Date().toISOString() }) });
  assert.equal(out.statusCode, 200);
  assert.ok((out.report.destination_gsc_queries || []).some(q => q.query === 'seo content optimalisatie'), 'the uploaded search term reaches the research');
});

test('an export without a dates file gets its period from the date filter (owner 2026-11-10: "No export yet" after an upload)', () => {
  const pagesOnly = 'Top pages,Clicks,Impressions,CTR,Position\n' + PAGE + ',2450,20547,11.92%,8.92\n';
  const read = (date, name) => g.readGscExport({ fileName: name, content: zip({ 'Queries.csv': QUERIES_NL, 'Pages.csv': pagesOnly, 'Filters.csv': 'Filter,Value\nSearch type,Web\nDate,' + date + '\nPage,' + PAGE + '\n' }), pageUrl: PAGE });
  const last28 = read('Last 28 days', 'https___contentscale.site_-Performance-on-Search-2026-11-10.zip');
  assert.equal(last28.status, 'VERIFIED_FOR_PAGE');
  assert.deepEqual({ start: last28.period.start, end: last28.period.end, days: last28.period.days, inferred: last28.period.inferred }, { start: '2026-10-12', end: '2026-11-08', days: 28, inferred: true });
  assert.equal(last28.totals.period_inferred, 'Last 28 days', 'kept with the totals, so the comparison can say so');
  assert.deepEqual(read('Afgelopen 3 maanden', 'Prestaties-2026-11-10.zip').period.start, '2026-08-09');
  assert.deepEqual(read('"Oct 12, 2026 - Nov 8, 2026"', 'x.zip').period, { start: '2026-10-12', end: '2026-11-08', days: 28 }, 'a custom range is read as is');
  assert.equal(read('Last 28 days', 'no-date-in-name.zip').period, null, 'no export date: no guessed period');
});

test('current Search Console exports put the daily rows in Chart.csv: the real dates are read from it (live export 2026-11-10)', () => {
  const days = []; for (let d = new Date('2026-10-11T00:00:00Z'); d <= new Date('2026-11-07T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10) + ',25,196,12.76%,8.5');
  const r = g.readGscExport({ fileName: 'https___contentscale.site_-Performance-on-Search-2026-11-10.zip', pageUrl: 'https://contentscale.site/',
    content: zip({ 'Chart.csv': 'Date,Clicks,Impressions,CTR,Position\n' + days.join('\n'), 'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\ncontent at scale,297,1238,23.99%,1.25\n',
      'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttps://contentscale.site/,700,5488,12.76%,8.5', 'Filters.csv': 'Filter,Value\nSearch type,Web (text-based)\nDate,Last 28 days\nPage,https://contentscale.site/' }) });
  assert.equal(r.status, 'VERIFIED_FOR_PAGE');
  assert.deepEqual(r.period, { start: '2026-10-11', end: '2026-11-07', days: 28 }, 'the real days, not derived from the file name');
  assert.equal(r.totals.source, 'DATES');
  const c = require('../src/growth-free/reminders.cjs').compareUploads([{ status: r.status, period_start: r.period.start, period_end: r.period.end, totals: r.totals, queries: r.queries }], '2026-11-09', '');
  assert.equal(c.before.matches_window, true, 'Search Console’s last 28 days, ending a day before the window, are these 4 weeks');
});
