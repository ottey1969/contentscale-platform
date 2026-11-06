'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const migration = read('migrations/20261106_tracker_workflow_schema_integrity.sql');
const fixture = read('tests/fixtures/staging-boot-schema.sql');
const required = {
  tracker_workflow_client_events: ['id', 'tracker_client_id', 'event_type', 'idempotency_key', 'event_data', 'created_at'],
  tracker_workflow_events: ['id', 'tracker_client_id', 'tracker_page_id', 'event_type', 'idempotency_key', 'event_data', 'created_at'],
  tracker_workflow_sitemap_events: ['id', 'tracker_client_id', 'idempotency_key', 'snapshot_hash', 'event_payload', 'created_at']
};
test('shared Tracker workflow event tables are provisioned as one additive migration', () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.doesNotMatch(migration, /\\b(?:DROP|TRUNCATE|DELETE\\s+FROM)\\b/i);
  for (const [table, cols] of Object.entries(required)) {
    const m = migration.match(new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table + ' \\(([\\s\\S]*?)\\n\\);'));
    assert.ok(m, 'Missing idempotent table migration: ' + table);
    const fixtureStart = fixture.indexOf('CREATE TABLE IF NOT EXISTS public."' + table + '"');
    assert.ok(fixtureStart >= 0, 'Staging test fixture has no ' + table);
    for (const col of cols) {
      assert.match(m[1], new RegExp('\\b' + col + '\\b'), table + '.' + col);
      assert.match(fixture.slice(fixtureStart, fixture.indexOf(');', fixtureStart)), new RegExp('"' + col + '"'), 'Fixture ' + table + '.' + col);
    }
    assert.match(m[1], /UNIQUE\\s*\\(/, 'Idempotency unique key ' + table);
    assert.match(m[1], /REFERENCES public\\.tracker_clients\\(id\\)/, 'Client FK ' + table);
  }
  assert.match(migration, /REFERENCES public\\.tracker_pages\\(id\\)/);
});
test('existing tables are never silently considered compatible', () => {
  for (const [table, cols] of Object.entries(required)) {
    assert.ok(migration.includes("RAISE EXCEPTION '" + table + " required columns mismatch"), table + ' guard absent');
    assert.ok(migration.includes('IF actual <> ' + cols.length + ' THEN'), table + ' count guard absent');
  }
});
