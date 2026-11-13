'use strict';
// Pre-Write evidence coverage: the gate needs a minimum number of candidate source pages actually read (statistics: 8,
// expert quotes: 10). Only that many were fetched, so one site that blocks bots or returns too little text made the
// Brief NOT PASSED ("checked 7/28") although 20 more candidates were waiting. This reads further candidates, in small
// batches and in their search order, until the required number of pages is read or the cap is reached. It runs before
// the evidence extraction, so every counted page is also a page the extraction reads: the count stays honest.
async function backfillEvidencePages({ candidates, corpus, required, maxAttempts, fetchPage, attempted = [] }) {
  const list = Array.from(candidates || []);
  const isRead = u => corpus.has(u);
  const readCount = () => list.filter(isRead).length;
  const need = Math.min(Number(required) || 0, list.length);
  const tried = new Set([...list.filter(isRead), ...Array.from(attempted || [])]); // a page that failed once is not retried
  let attempts = 0;
  const cap = Math.max(0, Number(maxAttempts) || 0);
  while (readCount() < need && attempts < cap) {
    const next = list.filter(u => !tried.has(u)).slice(0, Math.min(need - readCount(), cap - attempts)); // only the shortfall
    if (!next.length) break;
    next.forEach(u => tried.add(u));
    attempts += next.length;
    const pages = await Promise.all(next.map(u => Promise.resolve().then(() => fetchPage(u)).catch(() => null)));
    pages.forEach(p => { if (p && p.url) corpus.set(p.url, p); });
  }
  return { read: readCount(), required: need, extra_attempts: attempts };
}
// The extraction prompt keeps the budget it always had (14 sources x 3,000 characters) but now spreads it over every
// page that was read, so no page counts as checked without being read. Never below 1,500 characters per page.
const EXTRACTION_BUDGET = 14 * 3000;
const perSourceChars = n => Math.max(1500, Math.min(3000, Math.floor(EXTRACTION_BUDGET / Math.max(1, Number(n) || 1))));
module.exports = { backfillEvidencePages, perSourceChars, EXTRACTION_BUDGET };
