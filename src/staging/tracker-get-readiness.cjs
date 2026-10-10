'use strict';
// Metadata-only: parse the existing canonical GET contract as source text, never import app.
const fs=require('node:fs'),path=require('node:path');
function parseCanonicalGetRequirements(source=fs.readFileSync(path.resolve(__dirname,'../index.js'),'utf8')){
 const marker="app.get('/api/tracker-client/:token', async (req, res) => {";
 const at=source.indexOf(marker),end=source.indexOf('\n});',at);
 if(at<0||end<at||end-at>50000)throw Error('STAGING BLOCKED: unexpected canonical Tracker GET route');
 const route=source.slice(at,end+4);
 function bracketList(needle){
  const i=route.indexOf(needle), start=route.indexOf('[',i), finish=route.indexOf('];',start);
  if(i<0||start<0||finish<start||finish-start>3500)throw Error('STAGING BLOCKED: missing canonical GET schema list');
  return route.slice(start,finish);
 }
 const columnText=bracketList('const _trackerMainGetColumns = ');
 const columns=[...columnText.matchAll(/\[\s*'([a-z_]+)'\s*,\s*'[^']+'\s*\]/g)].map(m=>m[1]);
 const tableText=bracketList('const _requiredTables = ');
 const tables=[...tableText.matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
 if(columns.length<20||tables.length!==4||
    new Set(columns).size!==columns.length||new Set(tables).size!==tables.length){
  throw Error('STAGING BLOCKED: incomplete or duplicate canonical GET schema contract');
 }
 return {columns,tables};
}
async function inspectTrackerGetReadiness(pool){
 const required=parseCanonicalGetRequirements();
 const client=await pool.connect();
 let transaction=false;
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transaction=true;
  await client.query("SET LOCAL statement_timeout = '3000ms'");
  const cols=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tracker_pages'");
  const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[required.tables]);
  const presentColumns=new Set(cols.rows.map(r=>r.column_name));
  const presentTables=new Set(tables.rows.map(r=>r.table_name));
  const missingColumns=required.columns.filter(k=>!presentColumns.has(k));
  const missingTables=required.tables.filter(k=>!presentTables.has(k));
  await client.query('ROLLBACK');
  transaction=false;
  return Object.freeze({
   status:missingColumns.length||missingTables.length?'schema_migration_required':'tracker_get_schema_ready',
   schema_ready:missingColumns.length===0&&missingTables.length===0,
   checked_at:new Date().toISOString(),
   canonical_required_columns:required.columns.length,
   canonical_required_tables:required.tables.length,
   missing_columns:missingColumns,
   missing_tables:missingTables,
   writes_performed:false,
   app_started:false,
   requires_manual_approval_for_migration:true
  });
 }catch(error){
  if(transaction)try{await client.query('ROLLBACK')}catch(_){}
  throw new Error('STAGING BLOCKED: failed to inspect canonical GET prerequisites',{cause:error});
 }finally{client.release()}
}
module.exports={parseCanonicalGetRequirements,inspectTrackerGetReadiness};
