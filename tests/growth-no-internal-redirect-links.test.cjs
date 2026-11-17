'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {resolveGrowthInternalLink}=require('../src/growth-internal-link-resolver.cjs');
const page='https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/';
const old='https://perfectroofingteam.com/roof-emergency/';
const fin='https://perfectroofingteam.com/roof-repair/';
test('301 source resolves to direct final 200 URL for same site',async()=>{
 const r=await resolveGrowthInternalLink(old,page,{fetchLive:async url=>{
  assert.equal(url,old);
  return {status:200,final_url:fin,redirect_chain:[{url:old,status:301,location:fin}]};
 }});
 assert.equal(r.status,'RESOLVED_REDIRECT');assert.equal(r.url,fin);assert.equal(r.redirected,true);
});
test('direct working page remains direct',async()=>{
 const r=await resolveGrowthInternalLink(fin,page,{fetchLive:async()=>({status:200,final_url:fin,redirect_chain:[]})});
 assert.equal(r.status,'DIRECT_200');assert.equal(r.url,fin);
});
test('off-site redirect, self, bad URL, and failed check are never suggested',async()=>{
 for(const [url,result,status] of [
  [old,{status:200,final_url:'https://elsewhere.example/',redirect_chain:[]},'REDIRECTED_OFF_SITE'],
  [old,{status:200,final_url:page,redirect_chain:[]},'REDIRECT_TO_SELF']]){
  const r=await resolveGrowthInternalLink(url,page,{fetchLive:async()=>result});
  assert.equal(r.status,status);assert.equal(r.url,null);
 }
 assert.equal((await resolveGrowthInternalLink(page,page)).status,'SELF_LINK');
 assert.equal((await resolveGrowthInternalLink('http://perfectroofingteam.com/a',page)).status,'INVALID_URL');
 assert.equal((await resolveGrowthInternalLink(old,page,{fetchLive:async()=>{throw Object.assign(Error('timeout'),{code:'FETCH_TIMEOUT'})}})).status,'UNVERIFIED');
});
test('research and CMS must use live resolution and refuse unverified links in export',()=>{
 const research=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 const cms=fs.readFileSync('src/tracker-growth-cms-export.cjs','utf8');
 const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
 assert.match(research,/await resolveGrowthInternalLink\(report\.handoff_suggestions\.internal_url,page\.url\)/);
 assert.match(research,/internal_url=null/);
 assert.match(cms,/resolveGrowthInternalLink\(String\(req\.query\.link\),v\.page\.url/);
 assert.match(cms,/link_verification:linkStatus/);
 assert.match(cms,/const approvedForExport=/);
 assert.match(cms,/INTERNAL_LINK_NOT_DIRECT_200/);
 assert.match(cms,/changes:fixedChanges/);
 assert.match(ui,/Redirect resolved: the proposed link now points straight to/);
});
