'use strict';
// Free Growth: an optional Search Console export uploaded by the visitor (no Google sign-in). Accepted: the ZIP from
// Search Console > Performance > Export > Download CSV (Queries.csv, Pages.csv, Dates.csv, Filters.csv, ...), or one CSV
// with queries. The data is stored for this check only and never reaches the Tracker.
// It counts as evidence for this page only when the export is filtered on exactly this page (Filters.csv), or when its
// Pages.csv lists this page and nothing else. Otherwise it is shown as "not verified for this page" and not used in the
// research, the same rule as the Tracker's page-verified Search Console data. Headers may be in any language: the
// columns are read by their order (name, clicks, impressions, CTR, position), as Search Console writes them.
const zlib = require('node:zlib');

const MAX_BYTES = 3 * 1024 * 1024, MAX_ROWS = 1000;

// Minimal ZIP reader (stored and deflated entries), from the central directory. Only the CSV files are read.
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Object.assign(Error('NOT_A_ZIP'), { code: 'NOT_A_ZIP' });
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count && n < 50; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8'); p += 46 + nameLen + extra + comment;
    if (!/\.csv$/i.test(name) || size > MAX_BYTES) continue;
    const lNameLen = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28), start = local + 30 + lNameLen + lExtra;
    const data = buf.slice(start, start + size);
    const raw = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: MAX_BYTES }) : null;
    if (raw) out[name.split('/').pop()] = raw.toString('utf8').replace(/^﻿/, '');
  }
  return out;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) break; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows.map(r => r.map(x => x.trim()));
}
// "1,234" / "1.234" / "1 234" → 1234; "0,5%" → 0.005; "20,9" → 20.9.
const int = v => { const n = Number(String(v || '').replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0; };
function dec(v) {
  let t = String(v || '').replace(/[%\s]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t); return Number.isFinite(n) ? n : null;
}
const metrics = r => ({ clicks: int(r[1]), impressions: int(r[2]), ctr: r[3] == null ? null : (dec(r[3]) == null ? null : Math.round(dec(r[3]) * 100) / 10000), position: dec(r[4]) });
const isNumberRow = r => r.length >= 3 && /\d/.test(r[1] || '') && /\d/.test(r[2] || '');
function norm(u) { try { const x = new URL(String(u || '').trim()); return (x.hostname.replace(/^www\./, '') + (x.pathname.replace(/\/+$/, '') || '/')).toLowerCase(); } catch (e) { return ''; } }

// Which CSV is which: by file name (any language) or by content.
function classify(files) {
  const by = {}; const names = Object.keys(files);
  const pick = re => names.find(n => re.test(n));
  by.queries = pick(/quer|zoekopdracht|suchanfrage|consulta|requête|requete|sorgu/i);
  by.pages = pick(/^pages?\.csv$|pagina|seiten|páginas|pagine/i);
  // The daily rows: "Dates.csv" in older exports, "Chart.csv" in current ones (live export 2026-11-10), localized too.
  by.dates = pick(/date|datum|fecha|tarih|data\b/i) || pick(/chart|grafiek|diagram|grafik|gr[aá]fico|graphique/i);
  by.filters = pick(/filter|filtr/i);
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v).map(([k, v]) => [k, files[v]]));
}

// Verification against the checked page: an exact page filter, or a Pages.csv with only this page.
function verify(parts, pageUrl) {
  const target = norm(pageUrl);
  if (parts.filters) {
    for (const r of parseCsv(parts.filters)) {
      const urls = (r.join(' ').match(/https?:\/\/[^\s"',;]+/g) || []).map(norm);
      if (!urls.length) continue;
      const partial = /contain|bevat|enthält|contiene|contient|içer|not|niet|nicht|regex|custom|aangepast/i.test(r.join(' '));
      if (urls.includes(target) && !partial) return { status: 'VERIFIED_FOR_PAGE', basis: 'EXACT_PAGE_FILTER' };
      return { status: 'NOT_VERIFIED_FOR_PAGE', basis: urls.includes(target) ? 'PARTIAL_PAGE_FILTER' : 'OTHER_PAGE_FILTER' };
    }
  }
  if (parts.pages) {
    const rows = parseCsv(parts.pages).filter(isNumberRow);
    if (rows.length === 1 && norm(rows[0][0]) === target) return { status: 'VERIFIED_FOR_PAGE', basis: 'ONLY_THIS_PAGE_IN_PAGES' };
    if (rows.some(r => norm(r[0]) === target)) return { status: 'PAGE_TOTALS_ONLY', basis: 'PAGE_LISTED_AMONG_OTHERS' };
  }
  return { status: 'NOT_VERIFIED_FOR_PAGE', basis: 'NO_PAGE_FILTER' };
}

const MESSAGES = {
  VERIFIED_FOR_PAGE: 'Verified for this page: the export is filtered on exactly this page. Used as evidence in the research.',
  PAGE_TOTALS_ONLY: 'This export covers several pages. The totals of this page are shown, but the search terms are not limited to this page, so they are not used as evidence.',
  NOT_VERIFIED_FOR_PAGE: 'Not verified for this page: in Search Console, add the filter Page → "Exact URL" → this page, then export again. The numbers are shown but not used as evidence.'
};

// The period of an export without a usable dates file (owner 2026-11-10: a verified export showed "No export yet"). Search
// Console writes the chosen date range in Filters.csv: explicit dates for a custom range, or "Last 28 days" / "Last 3
// months" (in the interface language). A relative range is turned into dates with the export date in the file name
// ("…-2026-11-10.zip"): Search Console's ranges end two days before the export day. Such a period is marked inferred.
const MONTHS = { jan: 0, feb: 1, mar: 2, mrt: 2, maa: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11 };
const iso = d => d.toISOString().slice(0, 10);
function dateIn(t) {
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(t); if (m && MONTHS[m[1].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  m = /(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/i.exec(t); if (m && MONTHS[m[2].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  return null;
}
function periodFromFilters(filters, fileName) {
  if (!filters) return null;
  for (const r of parseCsv(filters)) {
    const k = String(r[0] || ''), v = r.slice(1).join(' ').trim();
    if (!/^(date|datum|fecha|data|tarih)/i.test(k.trim()) || !v) continue;
    // Explicit range: two dates in the value.
    const parts = v.split(/\s+[-–—]\s+|\s+(?:to|tot|bis|a|hasta)\s+/i).map(dateIn).filter(Boolean);
    if (parts.length >= 2) { const [a, b] = parts.slice(0, 2).sort((x, y) => x - y); return { start: iso(a), end: iso(b), days: Math.round((b - a) / 864e5) + 1 }; }
    // Relative range plus the export date from the file name.
    const exp = /(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/.exec(String(fileName || ''));
    const rel = /(\d+)\s*(day|dag|tag|día|dia|gün|month|maand|monat|mes|ay)/i.exec(v);
    if (!exp || !rel) return null;
    const end = new Date(exp[1] + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() - 2);
    const start = new Date(end); const n = +rel[1];
    if (/^(day|dag|tag|día|dia|gün)/i.test(rel[2])) start.setUTCDate(start.getUTCDate() - (n - 1)); else { start.setUTCMonth(start.getUTCMonth() - n); start.setUTCDate(start.getUTCDate() + 1); }
    return { start: iso(start), end: iso(end), days: Math.round((end - start) / 864e5) + 1, inferred: true, basis: v.slice(0, 60) };
  }
  return null;
}

// Read an upload. fileName decides ZIP or CSV; content is a Buffer.
function readGscExport({ fileName, content, pageUrl }) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ''), 'base64');
  if (!buf.length) return { status: 'INVALID', reason: 'EMPTY', message: 'The file is empty.' };
  if (buf.length > MAX_BYTES) return { status: 'INVALID', reason: 'TOO_LARGE', message: 'The file is larger than 3 MB. Export only this page.' };
  let files;
  try { files = /\.zip$/i.test(String(fileName || '')) || buf.readUInt32LE(0) === 0x04034b50 ? unzip(buf) : { [String(fileName || 'Queries.csv')]: buf.toString('utf8') }; }
  catch (e) { return { status: 'INVALID', reason: 'NOT_A_ZIP', message: 'This is not a Search Console export (ZIP or CSV).' }; }
  const parts = classify(files);
  if (!parts.queries && Object.keys(files).length === 1) parts.queries = Object.values(files)[0];
  if (!parts.queries) return { status: 'INVALID', reason: 'NO_QUERIES', message: 'No search terms found. Upload the ZIP from Search Console → Performance → Export, or its Queries CSV.' };
  const qrows = parseCsv(parts.queries).filter(isNumberRow).slice(0, MAX_ROWS);
  if (!qrows.length) return { status: 'INVALID', reason: 'NO_QUERIES', message: 'The search-terms file has no rows with clicks and impressions.' };
  const queries = qrows.map(r => ({ query: r[0].slice(0, 200), ...metrics(r) })).filter(x => x.query);
  let period = null, totals = null;
  if (parts.dates) {
    const d = parseCsv(parts.dates).filter(isNumberRow).map(r => ({ date: r[0], ...metrics(r) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
    if (d.length) {
      const sorted = d.map(x => x.date).sort();
      period = { start: sorted[0], end: sorted[sorted.length - 1], days: d.length };
      const clicks = d.reduce((a, x) => a + x.clicks, 0), impressions = d.reduce((a, x) => a + x.impressions, 0);
      const pos = d.filter(x => x.position != null && x.impressions), wpos = pos.reduce((a, x) => a + x.position * x.impressions, 0), wimp = pos.reduce((a, x) => a + x.impressions, 0);
      totals = { clicks, impressions, ctr: impressions ? Math.round(clicks / impressions * 10000) / 10000 : null, position: wimp ? Math.round(wpos / wimp * 10) / 10 : null, source: 'DATES' };
    }
  }
  if (!period) period = periodFromFilters(parts.filters, fileName);
  // Stored with the totals (the upload table keeps only the dates): the comparison says the dates were derived.
  if (period && period.inferred && totals) totals = { ...totals, period_inferred: period.basis || true };
  const v = verify(parts, pageUrl);
  if (!totals && parts.pages) {
    const row = parseCsv(parts.pages).filter(isNumberRow).find(r => norm(r[0]) === norm(pageUrl));
    if (row) totals = { ...metrics(row), source: 'PAGES' };
  }
  if (!totals) { const clicks = queries.reduce((a, x) => a + x.clicks, 0), impressions = queries.reduce((a, x) => a + x.impressions, 0);
    totals = { clicks, impressions, ctr: impressions ? Math.round(clicks / impressions * 10000) / 10000 : null, position: null, source: 'QUERIES_SUM_UNDERCOUNTS' }; }
  if (period && period.inferred && totals && !totals.period_inferred) totals = { ...totals, period_inferred: period.basis || true };
  return { status: v.status, basis: v.basis, message: MESSAGES[v.status], period, totals, queries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 200), files: Object.keys(files) };
}

// Rows for the research engine, in the shape of the Tracker's page-verified Search Console rows. Only verified uploads.
function engineRows(upload, { pageUrl, pageId = 1, clientId = 0 } = {}) {
  if (!upload || upload.status !== 'VERIFIED_FOR_PAGE') return [];
  const at = upload.uploaded_at || new Date().toISOString();
  return (upload.queries || []).slice(0, 150).map(q => ({ page_id: pageId, tracker_client_id: clientId, source_page_url: pageUrl, evidence_scope: 'page_verified',
    query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.position, imported_at: at }));
}

// The search term in the uploaded data (exact or as part of a longer term).
function termInExport(upload, term) {
  const t = String(term || '').trim().toLowerCase(); if (!t || !upload || !Array.isArray(upload.queries)) return null;
  const exact = upload.queries.find(q => q.query.toLowerCase() === t);
  return exact || null;
}

module.exports = { periodFromFilters, readGscExport, engineRows, termInExport, parseCsv, unzip, MESSAGES, MAX_BYTES };
