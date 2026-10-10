'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readOnlyDatabaseCheck,EXPECTED}=require('../src/staging/preflight-server.cjs');
function pool({badSchema=false,hasCustomer=false}={}){
 const calls=[];let released=false;
 const rows=[
  {table_name:'tracker_clients'}, {table_name:'tracker_pages'},
  {table_name:'tracker_snapshots'},{table_name:'tracker_case_studies'}
 ];
 const client={
  async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith('BEGIN'))return {rows:[]};
   if(sql.startsWith('ROLLBACK')||sql.startsWith('COMMIT'))return {rows:[]};
   if(sql.includes('current_database()'))return {rows:[{database_name:'neondb',...EXPECTED,...(badSchema?{tables:23}:{})}]};
   if(sql.includes('to_regclass'))return {rows:[{table_name:args[0]}]};
   if(sql.includes('SELECT table_name FROM information_schema.tables'))return {rows};
   if(sql.startsWith('SELECT EXISTS(SELECT 1'))return {rows:[{any_data:hasCustomer}]};
   throw Error('Unexpected query '+sql.slice(0,120));
  },release(){released=true;}
 };
 return {calls,get released(){return released;},async connect(){return client;}};
}
test('isolated preflight performs only read queries in read-only transaction',async()=>{
 const p=pool(),result=await readOnlyDatabaseCheck(p);
 assert.equal(result.empty,true);assert.equal(result.app_started,false);
 assert.equal(result.providers_disabled,true);assert.equal(p.released,true);
 assert.match(p.calls[0].sql,/READ ONLY/);
 assert.equal(p.calls.at(-1).sql,'COMMIT');
 assert(p.calls.every(x=>/^(BEGIN|SELECT|COMMIT)$/.test(x.sql.trim().split(/[\s(]/)[0])));
});
test('schema drift rejects before reading any customer rows',async()=>{
 const p=pool({badSchema:true});
 await assert.rejects(readOnlyDatabaseCheck(p),/schema mismatch/);
 assert.equal(p.calls.at(-1).sql,'ROLLBACK');
 assert.equal(p.released,true);
});
test('nonempty staging database rejects and rolls back',async()=>{
 const p=pool({hasCustomer:true});
 await assert.rejects(readOnlyDatabaseCheck(p),/staging table contains data/);
 assert.equal(p.calls.at(-1).sql,'ROLLBACK');assert.equal(p.released,true);
});
