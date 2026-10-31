'use strict';
// The owner reads every unverified statement and keeps (confirms) or removes it. Real data: report 68 (5 statements).
const test=require('node:test'),assert=require('node:assert/strict');
const {publicationReadiness}=require('../src/growth-publication-readiness.cjs');
const {growthEditCopyText}=require('../public/growth-edit-copy.js');
const {hashOf}=require('../src/growth-claim-review-store.cjs');
const f=require('./fixtures/growth-report-68/decision.json'),g=f.editorial_decision_gate;
const S=g.claim_review.needs_fact_check;

test('report 68 (real): all 5 statements are listed for the owner; undecided they block publication',()=>{
 const r=publicationReadiness({decision:g,destinationGsc:f.destination_gsc_evidence});
 assert.equal(r.statements.length,5);assert(r.statements.every(x=>x.decision==='UNDECIDED'));
 assert.equal(r.statements[0].text,'Content repurposing gives editorial teams a clear method to recycle published articles into new formats.');
 assert.equal(r.status,'NOT_READY_FOR_PUBLICATION');assert.equal(r.blockers[0].count,5);
});

test('kept statements are confirmed, removed ones leave the copied text; with all 5 decided nothing required blocks',()=>{
 const reviews=[[0,'KEEP'],[1,'REMOVE'],[2,'KEEP'],[3,'REMOVE'],[4,'KEEP']].map(([i,d])=>({statement_hash:hashOf(S[i]),statement:S[i],decision:d}));
 const part=publicationReadiness({decision:g,destinationGsc:f.destination_gsc_evidence,claimReviews:reviews.slice(0,2)});
 assert.equal(part.blockers.find(b=>b.code==='UNVERIFIED_STATEMENTS').count,3);assert.match(part.blockers[0].detail,/not yet reviewed by you/);
 const all=publicationReadiness({decision:g,destinationGsc:f.destination_gsc_evidence,claimReviews:reviews});
 assert(!all.blockers.some(b=>b.code==='UNVERIFIED_STATEMENTS'));assert.equal(all.kept,3);assert.equal(all.removed,2);
 assert.equal(all.status,'READY_FOR_OWNER_APPROVAL_WITH_NOTES','only the recommended baseline note remains');assert.equal(all.ready_for_publication,false,'never published automatically');
 const text=growthEditCopyText({...g,publication_readiness:all});
 assert(!text.includes('Writers outline the core points'),'removed statement 2 is not in the copied text');
 assert(!text.includes('Walk every team member through these guidelines'),'removed statement 4 is not in the copied text');
 assert(text.includes('Content repurposing gives editorial teams a clear method'),'kept statements stay');
 assert.match(text,/Confirmed by the owner: 3 statement\(s\)\./);assert.doesNotMatch(text,/^DRAFT FOR REVIEW/);
 // Whitespace and case do not change which statement a decision belongs to.
 assert.equal(hashOf('  CONTENT repurposing gives editorial teams a clear method to recycle published articles into new formats. '),hashOf(S[0]));
});

test('route: only the owner, only a tracked target page, only KEEP/REMOVE/UNDECIDED',async()=>{
 const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
 const saved=[];const post={};
 const mk=owner=>{registerGrowthAutomaticResearch({get(){},post(p,...h){post[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:owner,pages:[{id:2295,url:'https://contentscale.site/content-scaling/'}]};next()},
  {saveClaimReview:async a=>{saved.push(a);return a},loadClaimReviews:async()=>[]});return post['/api/tracker-client/:token/growth/claim-review']};
 const call=async(stack,body)=>{const req={params:{token:'t'},query:{page_id:'2295'},body},res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 const owner=mk(true);
 assert.equal((await call(owner,{target_page_id:2295,statement:S[0],decision:'KEEP'})).body.success,true);
 assert.deepEqual(saved[0],{clientId:3,targetPageId:2295,statement:S[0],decision:'KEEP'});
 assert.equal((await call(owner,{target_page_id:999,statement:S[0],decision:'KEEP'})).body.code,'TARGET_PAGE_NOT_FOUND');
 assert.equal((await call(owner,{target_page_id:2295,statement:S[0],decision:'PUBLISH'})).body.code,'DECISION_KEEP_OR_REMOVE');
 assert.equal((await call(mk(false),{target_page_id:2295,statement:S[0],decision:'KEEP'})).statusCode,403);
});
