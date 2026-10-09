'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSyntheticTestPrerequisites, TABLE_METADATA_SQL } = require('../src/staging/tracker-synthetic-prerequisites.cjs');
function fakePool(rows, fail = false) {
  const calls = [];
  let released = false;
  return {
    calls,
    get released(){return released;},
    async connect(){return {
      async query(sql,args) {
        calls.push({sql,args});
        if (fail && sql === TABLE_METADATA_SQL) throw Error('connection query failed');
        if (sql === TABLE_METADATA_SQL) return {rows};
        return {rows:[]};
      },
      release(){released=true;}
    };}
  };
}
const names = ['tracker_clients','tracker_pages','tracker_snapshots','tracker_case_studies','tracker_workflow_events','tracker_workflow_client_events','tracker_workflow_sitemap_events'];
const rows = names.map(table_name=>({table_name,rls_enabled:false,force_rls:false,non_internal_triggers:0,policies:0,mandatory_columns_without_default:2,outgoing_foreign_keys:1}));
test('only queries catalogs in a READ ONLY transaction; does not approve writes',async()=>{
 const pool=fakePool(rows);
 const v=await inspectSyntheticTestPrerequisites(pool);
 assert.equal(v.canonical_tracker_tables,7);
 assert.equal(v.mandatory_columns_without_default,14);
 assert.equal(v.outgoing_foreign_keys,7);
 assert.equal(v.writes_performed,false);
 assert.equal(v.automatic_synthetic_write_approved,false);
 assert.equal(v.requires_manual_review,true);
 assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
 assert.equal(pool.released,true);
 assert.match(pool.calls[0].sql,/READ ONLY/);
 assert.deepEqual(pool.calls[2].args,[names]);
 assert.ok(pool.calls.every(({sql})=>/^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(sql.trim())));
});
test('counts triggers and RLS as review signals without starting workflows',async()=>{
 const custom=rows.map(r=>({...r}));
 custom[0].non_internal_triggers=2;
 custom[1].rls_enabled=true;
 const v=await inspectSyntheticTestPrerequisites(fakePool(custom));
 assert.equal(v.non_internal_triggers,2);
 assert.equal(v.tables_with_row_level_security_or_policies,1);
 assert.equal(v.automatic_synthetic_write_approved,false);
});
test('blocks unexpected missing tables and rolls back',async()=>{
 const pool=fakePool(rows.slice(1));
 await assert.rejects(inspectSyntheticTestPrerequisites(pool),/STAGING BLOCKED/);
 assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
 assert(pool.released);
});
test('blocks query errors and rolls back',async()=>{
 const pool=fakePool(rows,true);
 await assert.rejects(inspectSyntheticTestPrerequisites(pool),/STAGING BLOCKED/);
 assert.equal(pool.calls.at(-1).sql,'ROLLBACK');
 assert(pool.released);
});
