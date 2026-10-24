'use strict';
// Strong, weak and insufficiently supported drafts across unrelated industries. All texts are SYNTHETIC test inputs.
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const industries={
 roofing:{query:'roof repair',dest:'Our roofing crew repairs leaks and replaces damaged shingles. We inspect the roof, explain what we find and send a written estimate. We are licensed and insured in New Jersey.',
  strong:'A written estimate should list the materials, the labor and any special access the crew needs, so ask for each line item before you approve the work.',
  weak:'An estimate always lists the materials and the labor, and it ensures you know what you are paying for.',
  weakSafe:'An estimate usually lists the materials and the labor, and it helps ensure you know what you are paying for.'},
 saas:{query:'invoice automation',dest:'Our software creates invoices from timesheets and sends reminders. It connects to the accounting export on the settings page.',
  strong:'Start by listing every manual step in your invoice process, then mark the steps a reminder or a template could handle.',
  weak:'Reminders always reduce late payments, so you never need to chase a customer by hand.',weakSafe:null},
 dental:{query:'teeth whitening',dest:'The clinic offers professional whitening after a short check of gum health. Sensitive teeth are discussed before treatment.',
  strong:'Before whitening, ask for a short check of your gums and discuss any sensitivity, so the treatment suits your teeth.',
  weak:'Professional whitening definitely gives the most comfortable result for sensitive teeth.',weakSafe:null}
};
for(const [name,x] of Object.entries(industries)){
 test(name+': a strong, procedural, sourced paragraph passes unchanged',()=>{
  const r=assessDraftClaims({text:x.strong,destinationText:x.dest,query:x.query});
  assert.equal(r.ok,true,JSON.stringify(r.violations));assert.deepEqual(r.safe_rewrites,[]);assert.equal(r.safe_text,x.strong);
 });
}
test('weak wording is softened (never strengthened) and every change is logged',()=>{
 const x=industries.roofing,r=assessDraftClaims({text:x.weak,destinationText:x.dest,query:x.query});
 assert.equal(r.ok,true,JSON.stringify(r.violations));assert.equal(r.safe_text,x.weakSafe);
 assert.deepEqual(r.safe_rewrites[0].changes.map(c=>c.from.toLowerCase()).sort(),['always','ensures']);
});
test('weak wording that cannot be softened without changing its meaning is rejected, not reworded',()=>{
 const x=industries.dental,r=assessDraftClaims({text:x.weak,destinationText:x.dest,query:x.query});
 assert.equal(r.ok,false);assert(r.violations.some(v=>v.code==='UNSUPPORTED_SUPERLATIVE'),JSON.stringify(r.violations));
 const g=assessDraftClaims({text:'Whitening is guaranteed to work and 100% safe.',destinationText:x.dest,query:'teeth whitening'});
 assert.equal(g.ok,false);assert(g.violations.some(v=>v.code==='ABSOLUTE_CLAIM'));assert(g.violations.some(v=>v.code==='UNSOURCED_NUMBER'));
});
test('known limit: a softened generic benefit statement is still the owner\'s fact-check, not proof',()=>{
 const x=industries.saas,r=assessDraftClaims({text:x.weak,destinationText:x.dest,query:x.query});
 assert.equal(r.ok,true);assert(r.safe_rewrites.length===1,'softened and logged so the reviewer can see it');
});
const reject=(text,code,dest='The crew repairs roofs and sends an estimate.',query='roof repair',brandLabel='')=>{
 const r=assessDraftClaims({text,destinationText:dest,query,brandLabel});
 assert.equal(r.ok,false,'should reject: '+text);assert(r.violations.some(v=>v.code===code),'wanted '+code+' got '+JSON.stringify(r.violations.map(v=>v.code)));return r;
};
test('unsupported claims are rejected with a concrete code and reason',()=>{
 reject('A good repair will improve your rankings and bring more leads.','UNPROVEN_OUTCOME_CLAIM');
 reject('This guide helps you reach page one of Google.','UNPROVEN_OUTCOME_CLAIM');
 reject('Pages like this are cited by ChatGPT and recommended by AI Overviews.','UNPROVEN_AI_CITATION_CLAIM');
 reject('Perplexity trusts pages with a clear estimate section.','UNPROVEN_AI_CITATION_CLAIM');
 reject('A typical repair costs $450 and takes 3 days.','UNSOURCED_NUMBER');
 reject('We are licensed, insured and award-winning.','UNSOURCED_CREDENTIAL_CLAIM');
 reject('Our crew has 25 years of experience.','UNSOURCED_NUMBER');
 reject('Acme Shield detects leaks and includes a ten year coverage plan.','UNSOURCED_NAMED_ENTITY_CLAIM');
 reject('The crew repairs roofs and sends an estimate.','DUPLICATES_DESTINATION_SENTENCE','The crew repairs roofs and sends an estimate.');
 const r=reject('Perfect Roofing is the leading specialist and offers free inspections.','UNSOURCED_CREDENTIAL_CLAIM','The crew repairs roofs.','roof repair','perfectroofing');
 assert(r.violations.every(v=>v.reason.length>20),'reasons are concrete');
});
test('a credential or figure is allowed exactly when the destination page itself states it',()=>{
 const dest=industries.roofing.dest+' We have repaired roofs since the 1990s and offer a 10 year workmanship warranty.';
 assert.equal(assessDraftClaims({text:'We are licensed and insured, and we offer a 10 year workmanship warranty.',destinationText:dest,query:'roof repair'}).ok,true);
 assert.equal(assessDraftClaims({text:'We are licensed and insured, and we offer a 25 year workmanship warranty.',destinationText:dest,query:'roof repair'}).ok,false);
});
test('procedural advice that mentions third-party tools or credentials generically is not a claim',()=>{
 assert.equal(assessDraftClaims({text:'Open Google Search Console and check which queries already bring visitors to the page. Ask any contractor whether they are licensed and insured.',destinationText:'The page lists repair services.',query:'roof repair'}).ok,true);
});
