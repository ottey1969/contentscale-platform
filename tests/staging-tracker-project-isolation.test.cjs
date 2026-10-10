'use strict';
// Synthetic isolation regression: never connects to actual Neon or starts any HTTP server.
// Both Neon projects can have a database named neondb; the schema/emptiness gate
// must reject a production-like dataset even when name/hostname look valid.
const test=require('node:test'),assert=require('node:assert/strict');
const {readOnlyDatabaseCheck,EXPECTED}=require('../src/staging/preflight-server.cjs');
const {TRACKER_TABLES}=require('../src/staging/tracker-readonly.cjs');
const names=[...TRACKER_TABLES,...Array.from({length:24-TRACKER_TABLES.length},(_,i)=>'synthetic_aux_'+i)];
assert.equal(names.length,24);
function fake({tables=EXPECTED.tables,columns=EXPECTED.columns,
  foreign_keys=EXPECTED.foreign_keys,indexes=EXPECTED.indexes,
  populated=null,database_name='neondb'}={}){
 const calls=[];let released=false;
 const client={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.startsWith('SELECT current_database()'))return {rows:[{
   database_name,tables,columns,foreign_keys,indexes
  }]};
  if(sql.startsWith('SELECT to_regclass'))return {rows:[{table_name:args[0]}]};
  if(sql.startsWith('SELECT table_name FROM information_schema.tables'))
   return {rows:names.map(table_name=>({table_name}))};
  if(sql.startsWith('SELECT EXISTS(')){
   const hit=populated && sql.includes('public."'+populated+'"');
   return {rows:[{any_data:!!hit}]};
  }
  throw Error('Unexpected readOnlyDatabaseCheck SQL: '+sql.slice(0,100));
 },release(){released=true}};
 return {calls,get released(){return released},async connect(){return client}};
}
function assertNonMutating(calls){
 assert(calls.length>=2);
 assert(calls.every(c=>/^(BEGIN TRANSACTION .* READ ONLY|SELECT |COMMIT$|ROLLBACK$)/.test(c.sql)));
}
test('exact 24-table empty staging metadata passes without any SQL write',async()=>{
 const db=fake();
 const r=await readOnlyDatabaseCheck(db);
 assert.equal(r.empty,true);
 assert.equal(r.app_started,false);
 assert.equal(r.providers_disabled,true);
 assert.equal(r.tables,24);
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.released,true);
 assertNonMutating(db.calls);
});
test('production-like schema is refused even if DB name is neondb',async()=>{
 const db=fake({tables:200,columns:2500});
 await assert.rejects(readOnlyDatabaseCheck(db),/STAGING BLOCKED: schema mismatch/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assert(db.released);
 assertNonMutating(db.calls);
});
test('matching schema but any existing PRT/customer page is refused',async()=>{
 const db=fake({populated:'tracker_pages'});
 await assert.rejects(readOnlyDatabaseCheck(db),/STAGING BLOCKED: staging table contains data: tracker_pages/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assert(db.released);
 assertNonMutating(db.calls);
});
test('matching schema but existing case study is also refused',async()=>{
 const db=fake({populated:'tracker_case_studies'});
 await assert.rejects(readOnlyDatabaseCheck(db),/STAGING BLOCKED: staging table contains data: tracker_case_studies/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assert(db.released);
 assertNonMutating(db.calls);
});
test('non-neondb database name fails closed before table inventory',async()=>{
 const db=fake({database_name:'external'});
 await assert.rejects(readOnlyDatabaseCheck(db),/schema mismatch/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assertNonMutating(db.calls);
});
