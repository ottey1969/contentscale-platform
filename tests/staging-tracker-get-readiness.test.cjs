'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseCanonicalGetRequirements,inspectTrackerGetReadiness}=require('../src/staging/tracker-get-readiness.cjs');
function pool({missingColumn=false,missingTable=false,dbError=false}={}){
 const {columns,tables}=parseCanonicalGetRequirements();
 const calls=[];let released=false;
 return {calls,get released(){return released}, async connect(){return{
  async query(sql,args=[]){
   calls.push({sql,args});
   if(dbError&&sql.includes('information_schema'))throw Error('simulated SQL failure');
   if(sql.includes('information_schema.columns'))return {rows:columns.slice(missingColumn?1:0).map(column_name=>({column_name}))};
   if(sql.includes('information_schema.tables'))return {rows:tables.slice(missingTable?1:0).map(table_name=>({table_name}))};
   return {rows:[]};
  },release(){released=true;}
 }}};
}
test('GET requirements are extracted from one canonical source contract',()=>{
 const contract=parseCanonicalGetRequirements();
 assert(contract.columns.length>=20);
 assert.equal(contract.tables.length,4);
 assert(contract.tables.includes('tracker_ai_evidence'));
});
test('ready schema is inspected in read-only transaction with no writes',async()=>{
 const p=pool(),r=await inspectTrackerGetReadiness(p);
 assert.equal(r.status,'tracker_get_schema_ready');
 assert.equal(r.schema_ready,true);
 assert.equal(r.writes_performed,false);
 assert.equal(r.app_started,false);
 assert.equal(p.calls.at(-1).sql,'ROLLBACK');
 assert(p.calls.every(({sql})=>/^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(sql)));
 assert(p.released);
});
test('missing columns and tables are explicitly reported without migrations',async()=>{
 const p=pool({missingColumn:true,missingTable:true}),r=await inspectTrackerGetReadiness(p);
 assert.equal(r.schema_ready,false);
 assert.equal(r.status,'schema_migration_required');
 assert.equal(r.missing_columns.length,1);
 assert.equal(r.missing_tables.length,1);
 assert(p.released);
});
test('database error rolls back and fails closed',async()=>{
 const p=pool({dbError:true});
 await assert.rejects(inspectTrackerGetReadiness(p),/STAGING BLOCKED/);
 assert.equal(p.calls.at(-1).sql,'ROLLBACK');
 assert(p.released);
});
