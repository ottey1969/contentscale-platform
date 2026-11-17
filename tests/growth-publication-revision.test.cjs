'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {registerGrowthExecution}=require('../src/tracker-growth-execution.cjs');
const {confirmationMessage}=require('../src/growth-measurement-reminders.cjs');
const page='https://contentscale.site/example/';
const past=new Date(Date.now()-4*86400000).toISOString(),later=new Date(Date.now()-2*86400000).toISOString();
function createRoute(){
 let post=null,writes=0,prior={id:77,published_at:past,notes:'First published edits'};
 const pool={query:async(sql)=>{
  const s=String(sql);
  if(s.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site'}]};
  if(s.includes('FROM tracker_pages'))return {rows:[{id:7,url:page}]};
  if(s.includes('FROM tracker_case_studies')||s.includes('FROM tracker_gsc_queries'))return {rows:[]};
  if(s.includes('CREATE TABLE'))return {rows:[]};
  if(s.includes('SELECT id,published_at,notes FROM tracker_growth_publications'))return {rows:[prior]};
  if(s.includes('INSERT INTO tracker_growth_publications')){writes++;return {rows:[{id:78,published_at:later}]}}
  throw Error('Unexpected SQL '+s);
 }};
 registerGrowthExecution({post(path,fn){if(path==='/api/tracker-client/:token/growth/publication')post=fn}},pool);
 async function call(b){
  const res={code:200,status(n){this.code=n;return this},json(o){this.data=o;return o}};
  await post({params:{token:'owner'},body:{page_id:7,query:'What is SEO?',notes:'Replaced the old headings and published new instructions',published_at:later,...b}},res);
  return res;
 }
 return {call,getWrites:()=>writes};
}
test('duplicate page and question is refused until owner explicitly selects a later separate release',async()=>{
 const {call,getWrites}=createRoute();
 const dup=await call({});
 assert.equal(dup.code,409);assert.equal(dup.data.code,'EXISTING_PUBLICATION');assert.equal(dup.data.previous.id,77);
 assert.equal(getWrites(),0);
 const sameTime=await call({new_publication:true,published_at:past});
 assert.equal(sameTime.code,409);
 const sameNotes=await call({new_publication:true,notes:'First published edits'});
 assert.equal(sameNotes.code,409);
 const next=await call({new_publication:true});
 assert.equal(next.code,200);assert.equal(getWrites(),1);
 assert.equal(next.data.measured_improvement,false);
});
test('one CMS form offers choice between correcting record and distinct later publication',()=>{
 const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
 const js=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
 assert.equal((html.match(/id="publicationForm"/g)||[]).length,1);
 for(const marker of ['existingPublicationChoice','editPreviousPublication','newPublishedUpdate','reusePublicationEmail'])assert.ok(html.includes(marker),marker);
 assert.match(js,/if\(safe\.priorPublication&&!safe\.publicationChoice\)/);
 assert.match(js,/body\.new_publication=true/);
 assert.match(js,/r\.status===409&&d\.code==='EXISTING_PUBLICATION'/);
 assert.match(js,/safe\.publicationId=mode==='edit'\?Number\(old\.id\):null/);
 assert.match(js,/publicationChoice==='new'/);
});
test('corrected or second publication has a clearly distinguished email with content changes',()=>{
 const first=confirmationMessage({emails:['editor@example.com'],url:page,publishedAt:later,notes:'Original changes',gscAvailable:false});
 const updated=confirmationMessage({emails:['editor@example.com'],url:page,publishedAt:later,notes:'Updated page with newer sections',gscAvailable:false,updated:true});
 assert.match(updated.subject,/Updated published content/);
 assert.match(updated.html,/second confirmation/);
 assert.match(updated.html,/Updated page with newer sections/);
 assert.doesNotMatch(first.subject,/Updated published content/);
 const server=fs.readFileSync('src/tracker-growth-execution.cjs','utf8');
 assert.match(server,/updated:!!prior/);
 assert.match(server,/updated:modified/);
 assert.match(server,/previousReminder\?\.emails/);
});
