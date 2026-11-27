'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('parallel first campaign requests across worker pools complete and keep one default link', {
  skip: !isolated && 'requires disposable local PostgreSQL',
  timeout: 15000
}, async () => {
  const { Pool } = require('pg');
  const schema = 'campaign_boot_' + crypto.randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const workers = Array.from({ length: 4 }, () =>
    new Pool({ connectionString: database, options: '-c search_path=' + schema }));
  try {
    await control.query('CREATE SCHEMA ' + schema);
    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const start = source.indexOf('// Prospect campaign links use a canonical initializer.');
    const legacyStart = source.indexOf('async function _pqsEnsureCampaignLinks()');
    const begin = start >= 0 ? start : legacyStart;
    const end = source.indexOf("app.get('/api/prospect-quick-scan/admin/campaign-links'", begin);
    assert.ok(begin >= 0 && end > begin);
    const init = workers.map(pool => vm.runInNewContext(
      source.slice(begin, end) + '\n_pqsEnsureCampaignLinks;', { pool }));
    await Promise.all(init.flatMap(load => [load(), load()]));
    const { rows } = await workers[0].query('SELECT source,language,campaign FROM prospect_public_campaign_links');
    assert.deepEqual(rows, [{ source: 'contact_form', language: 'en', campaign: '' }]);
  } finally {
    await Promise.all(workers.map(pool => pool.end()));
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
