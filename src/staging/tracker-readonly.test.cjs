'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { TRACKER_TABLES, readOnlyTrackerCheck } = require('./tracker-readonly.cjs');
function poolFor({missing, populated, fail} = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, args) {
      calls.push({sql,args});
      if (fail && sql.startsWith('SELECT COUNT')) throw new Error('DB failure');
      if (sql.includes('information_schema.columns')) return {rows:[{total:args[0] === missing ? 0 : 3}]};
      if (sql.startsWith('SELECT COUNT(*)::int AS total FROM public.')) return {rows:[{total:sql.includes('"'+populated+'"') ? 1 : 0}]};
      return {rows:[]};
    },
    release(){ released=true; }
  };
  return {calls, client, get released(){return released}, async connect(){return client}};
}
test('verifies all canonical Tracker tables using read-only SQL',async()=>{
  const pool=poolFor();
  const result=await readOnlyTrackerCheck(pool);
  assert.equal(result.status,'tracker_schema_verified_readonly');
  assert.equal(result.canonical_tracker_tables,7);
  assert.equal(result.workflow_execution_enabled,false);
  assert.equal(result.app_started,false);
  assert.equal(result.records_total,0);
  assert.equal(TRACKER_TABLES.length, 7);
  assert.equal(Object.hasOwn(result, 'tables'), false);
  assert(pool.released);
  assert.equal(pool.calls[0].sql,'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(pool.calls.at(-1).sql,'COMMIT');
  assert(pool.calls.every(x=>/^(BEGIN|SELECT|COMMIT)/.test(x.sql)));
});
test('fails closed and rolls back for absent table',async()=>{
  const pool=poolFor({missing:'tracker_pages'});
  await assert.rejects(readOnlyTrackerCheck(pool),/missing tracker_pages/);
  assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
  assert(pool.released);
});
test('fails closed and rolls back for nonempty table',async()=>{
  const pool=poolFor({populated:'tracker_pages'});
  await assert.rejects(readOnlyTrackerCheck(pool),/expected empty Tracker table tracker_pages/);
  assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
  assert(pool.released);
});
test('fails closed on query error and releases connection',async()=>{
  const pool=poolFor({fail:true});
  await assert.rejects(readOnlyTrackerCheck(pool),/DB failure/);
  assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
  assert(pool.released);
});
