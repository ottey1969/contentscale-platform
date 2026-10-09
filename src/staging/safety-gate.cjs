'use strict';
// This module is intentionally dependency-free and is used ONLY for staging.
const FORBIDDEN_SECRETS = [
  'BREVO_API_KEY', 'SENDGRID_API_KEY', 'SENDGRID_KEY', 'TELEGRAM_BOT_TOKEN',
  'GEMINI_API_KEY', 'GEMINI_KEY_LEADCRAWLER', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'SERPAPI_KEY', 'SERPER_API_KEY',
  'APIFY_TOKEN', 'VAPI_API_KEY', 'CALLMEBOT_API_KEY', 'SMTP_PASSWORD',
  'WORDPRESS_APP_PASSWORD', 'WP_APP_PASSWORD', 'STRIPE_SECRET_KEY'
];
const REQUIRE = {
  CS_DEPLOYMENT_TIER: 'staging',
  CS_TRACKER_WORKFLOW_SHADOW: '1',
  CS_TRACKER_WORKFLOW_READONLY_GET: '1',
  CS_STAGING_SCAN_EXECUTION_ENABLED: '0',
  ENABLE_TRACKER_SCHEDULER: '0'
};
function checkedConnection(env) {
  if (!env.DATABASE_URL) throw new Error('STAGING BLOCKED: DATABASE_URL missing');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch (_) { throw new Error('STAGING BLOCKED: DATABASE_URL invalid'); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw new Error('STAGING BLOCKED: non-Postgres DATABASE_URL');
  if (!url.hostname.endsWith('.neon.tech') || !url.hostname || url.hostname === '.neon.tech') throw new Error('STAGING BLOCKED: Neon host required');
  if (url.pathname !== '/neondb') throw new Error('STAGING BLOCKED: expected staging database name');
  if (url.searchParams.get('sslmode') !== 'require' && url.searchParams.get('sslmode') !== 'verify-full') throw new Error('STAGING BLOCKED: SSL required');
  return { host: url.hostname, database: 'neondb' }; // Never return username/password.
}
function assertPreflightEnvironment(env) {
  for (const [key, value] of Object.entries(REQUIRE)) {
    if (env[key] !== value) throw new Error('STAGING BLOCKED: ' + key + ' must equal ' + value);
  }
  for (const key of FORBIDDEN_SECRETS) {
    if (env[key]) throw new Error('STAGING BLOCKED: forbidden provider secret present: ' + key);
  }
  if (env.CS_STAGING_ISOLATED_DB_CONFIRMED !== '0') throw new Error('STAGING BLOCKED: preflight requires isolated DB confirmation pending (=0)');
  if (env.CS_STAGING_SIDE_EFFECTS_DISABLED !== '0') throw new Error('STAGING BLOCKED: preflight uses unapproved side effects status (=0)');
  if (env.CS_STAGING_APP_BOOT_APPROVED === '1') throw new Error('STAGING BLOCKED: app boot approval is not permitted for read-only preflight');
  for (const key of ['APP_URL','BASE_URL','PUBLIC_URL']) {
    const v = String(env[key] || '');
    if (/(^|\/)app\.contentscale\.site(?:\/|$)/i.test(v)) throw new Error('STAGING BLOCKED: production URL in ' + key);
  }
  return checkedConnection(env);
}
function assertAppBootEnvironment(env) {
  // Deliberately fail closed for this release, independent of any caller-defined flag.
  if (env.CS_DEPLOYMENT_TIER === 'staging') {
    throw new Error('STAGING BLOCKED: full ContentScale app is not authorised in this candidate. Use node src/staging/preflight-server.cjs');
  }
  // This overlay is never a production release. If somehow run in production, stop.
  throw new Error('RELEASE BLOCKED: staging overlay may not boot the full application');
}
module.exports = { checkedConnection, assertPreflightEnvironment, assertAppBootEnvironment, FORBIDDEN_SECRETS };
