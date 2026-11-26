'use strict';
// Keep the exact page and the original dates from the authorized GSC report.
// Direct uploads are appended by the caller and retain precedence.
const { exactUrl } = require('../implementation-report.cjs');
const { relatedReports } = require('./gsc-audit-handoff.cjs');

const urlKey = value => {
  try { return exactUrl(value); } catch { return null; }
};
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

async function reportUploadsFor(pool, { url, checkId = null, inviteId = null } = {}) {
  const key = urlKey(url);
  if (!key) return [];
  const reports = await relatedReports(pool, { url: key, checkId, inviteId }).catch(() => []);
  const uploads = [];
  for (const { title, report } of reports) {
    if (!report) continue;
    const after = Array.isArray(report.after_history) ? report.after_history : report.after ? [report.after] : [];
    const periods = [{ period: report.kpis?.period, pages: report.pages }, ...after];
    for (const { period, pages } of periods) {
      if (!period?.start || !period.end) continue;
      const page = (pages || []).find(item => urlKey(item.url) === key);
      if (!page) continue;
      const totals = { clicks: number(page.clicks), impressions: number(page.impressions), position: number(page.position) };
      if (totals.clicks === null && totals.impressions === null && totals.position === null) continue;
      uploads.push({
        status: 'VERIFIED_FOR_PAGE', source: 'GSC_REPORT', report_title: String(title || '').slice(0, 160), file_name: 'GSC report',
        period_start: String(period.start).slice(0, 10), period_end: String(period.end).slice(0, 10),
        totals, queries: Array.isArray(page.queries) ? page.queries.slice(0, 200) : []
      });
    }
  }
  return uploads;
}

module.exports = { reportUploadsFor };
