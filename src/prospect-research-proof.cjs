'use strict';

const { exactUrl } = require('./implementation-report.cjs');
const { registrationDomain } = require('./tracker-registration-identity.cjs');

function pageUrl(value) {
  try { return exactUrl(value); } catch { return null; }
}

function auditReference(value) {
  try {
    const official = 'https://app.contentscale.site';
    const url = new URL(value, official);
    const configured = process.env.APP_URL ? new URL(process.env.APP_URL).origin : official;
    if (![official, configured].includes(url.origin) || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.match(/^\/(report|opportunity-report)\/([a-f0-9]+)\/?$/);
    if (!parts || (parts[1] === 'report' ? parts[2].length !== 16 : ![64, 96].includes(parts[2].length))) return null;
    return parts[2];
  } catch { return null; }
}

async function storedReport(pool, key) {
  if (typeof key !== 'string' || ![16, 64, 96].includes(key.length) || !/^[a-f0-9]+$/.test(key)) return null;
  let rows;
  try {
    ({ rows } = await pool.query(`SELECT domain,source_url,report_data,created_at
       FROM opportunity_reports WHERE revoked_at IS NULL
         AND (CASE WHEN length($1)=16 THEN token LIKE $1||'%' ELSE token=$1 END)
       LIMIT 2`, [key]));
  } catch (error) {
    if (error.code === '42P01') return null;
    throw error;
  }
  return rows.length === 1 ? rows[0] : null;
}

function projectReport(source, record, domain, exactPage) {
  if (!record || registrationDomain(record.domain) !== domain) return null;
  const report = record.report_data;
  const pages = new Map();
  const belongs = input => {
    const url = pageUrl(input);
    return url && registrationDomain(new URL(url).hostname) === domain && (!exactPage || exactPage === url) ? url : null;
  };
  for (const page of Array.isArray(report?.page_analysis) ? report.page_analysis : []) {
    const url = belongs(page?.url);
    if (!url || pages.has(url)) continue;
    pages.set(url, {
      url, title: typeof page.title === 'string' ? page.title.slice(0, 300) : null,
      score: Number.isFinite(page.content_score) ? page.content_score : null
    });
  }
  const findings = [];
  for (const item of Array.isArray(report?.opportunities) ? report.opportunities : []) {
    const url = belongs(item?.url);
    if (url && typeof item.title === 'string' && item.title.trim()) {
      findings.push({ url, title: item.title.slice(0, 300), status: typeof item.status === 'string' ? item.status.slice(0, 60) : null });
    }
  }
  return { source, recorded_at: record.created_at, pages: [...pages.values()], findings };
}

async function prospectResearch(pool, prospect, page) {
  const domain = registrationDomain(new URL(page).hostname);
  const ceo = await storedReport(pool, prospect.ceo_report_token);
  const allowedCeoPage = pageUrl(prospect.ceo_report_page_url || ceo?.source_url);
  const audit = prospect.audit20_status === 'ready' ? await storedReport(pool, auditReference(prospect.audit20_report_url)) : null;
  return [
    allowedCeoPage && projectReport('ceo_scan', ceo, domain, allowedCeoPage),
    projectReport('audit20', audit, domain)
  ].filter(Boolean);
}

module.exports = { prospectResearch };
