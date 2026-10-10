'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js', output=process.argv[3]||'/tmp/contentscale-event-candidate.js';
const source=fs.readFileSync(input,'utf8');
const routes=[
  "/api/tracker-client/:token/pages/:pageId/manual-done",
  "/api/tracker-client/:token/pages/manual-done-all"
];
const singleSQL=[
 "WITH changed AS (",
 "UPDATE tracker_pages SET manual_done=$1,",
 "manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END",
 "WHERE id=$2 AND tracker_client_id=$3 AND manual_done IS DISTINCT FROM $1",
 "RETURNING id,tracker_client_id,manual_done,manual_done_at",
 ") INSERT INTO tracker_workflow_events",
 "(tracker_client_id,tracker_page_id,event_type,idempotency_key,event_data)",
 "SELECT tracker_client_id,id,'manual_done_changed',",
 "('manual_done:'||id::text||':'||gen_random_uuid()::text)::varchar(128),",
 "jsonb_build_object('manual_done',manual_done,'manual_done_at',manual_done_at,'source','tracker_ui')",
 "FROM changed ON CONFLICT (tracker_client_id,tracker_page_id,idempotency_key) DO NOTHING",
 "RETURNING tracker_page_id"
].join(' ');
const bulkSQL=[
 "WITH changed AS (",
 "UPDATE tracker_pages SET manual_done=$1,",
 "manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END",
 "WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL)",
 "AND manual_done IS DISTINCT FROM $1",
 "RETURNING id,tracker_client_id,manual_done,manual_done_at",
 "), page_logged AS (",
 "INSERT INTO tracker_workflow_events",
 "(tracker_client_id,tracker_page_id,event_type,idempotency_key,event_data)",
 "SELECT tracker_client_id,id,'manual_done_changed',",
 "('manual_done:'||id::text||':'||gen_random_uuid()::text)::varchar(128),",
 "jsonb_build_object('manual_done',manual_done,'manual_done_at',manual_done_at,'source','tracker_bulk_ui')",
 "FROM changed ON CONFLICT (tracker_client_id,tracker_page_id,idempotency_key) DO NOTHING",
 "RETURNING tracker_client_id,tracker_page_id",
 "), client_logged AS (",
 "INSERT INTO tracker_workflow_client_events",
 "(tracker_client_id,event_type,idempotency_key,event_data)",
 "SELECT $2,'manual_done_bulk_changed',",
 "('manual_done_bulk:'||gen_random_uuid()::text)::varchar(128),",
 "jsonb_build_object('manual_done',$1,'changed_page_count',(SELECT COUNT(*) FROM page_logged),'source','tracker_bulk_ui')",
 "WHERE EXISTS (SELECT 1 FROM page_logged)",
 "ON CONFLICT (tracker_client_id,idempotency_key) DO NOTHING",
 "RETURNING tracker_client_id",
 ") SELECT COUNT(*)::int AS changed_count FROM page_logged"
].join(' ');
const quote=String.fromCharCode(96);
let next=source, patches=0;
for(const path of routes){
 const marker="app.patch('"+path+"', async (req, res) => {";
 const pos=next.indexOf(marker);
 assert(pos>=0&&next.indexOf(marker,pos+1)<0,'Route must be unique');
 const end=next.indexOf('\n});',pos);
 assert(end>pos&&end-pos<3500,'Unsafe route span');
 let route=next.slice(pos,end+4);
 const isSingle=path.includes(':pageId');
 const old=isSingle?
 "'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE id=$2 AND tracker_client_id=$3 AND manual_done IS DISTINCT FROM $1'":
 "'UPDATE tracker_pages SET manual_done=$1, manual_done_at=CASE WHEN $1 THEN COALESCE(manual_done_at,NOW()) ELSE NULL END WHERE tracker_client_id=$2 AND (is_active=TRUE OR is_active IS NULL) AND manual_done IS DISTINCT FROM $1'";
 const replacement=quote+(isSingle?singleSQL:bulkSQL)+quote;
 if(route.includes(old)){
   route=route.replace(old,replacement);
   if(!isSingle){
     const response="updated: r.rowCount";
     assert(route.includes(response),'Bulk count response changed');
     route=route.replace(response,"updated: Number(r.rows[0]?.changed_count||0)");
   }
   patches++;
 }else{
   assert(route.includes(replacement),'Unexpected already-patched event SQL in route: '+path);
 }
 next=next.slice(0,pos)+route+next.slice(end+4);
}
assert(patches===0||patches===2,'Only one event route updated');
fs.writeFileSync(output,next);
console.log(JSON.stringify({status:patches?'event_candidate':'already_patched',routes_updated:patches,atomic_statement:true,source_bytes:Buffer.byteLength(next)}));
