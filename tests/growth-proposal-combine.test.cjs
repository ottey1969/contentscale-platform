'use strict';
// The CMS handoff offers every stored concept for a page: the newest as the main proposal, the others with only the
// sections a newer one does not already contain. Synthetic rows (labelled), no production data.
const test=require('node:test'),assert=require('node:assert/strict');
const {combineProposals}=require('../src/growth-proposal-store.cjs');
const {prepareGrowthCmsHandoff}=require('../src/growth-cms-handoff.cjs');

test('newest is the main proposal; earlier ones keep only sections with a new H2',()=>{
 const rows=[{id:3,sections:[{h2:'How to read the estimate',text:'a'}]},
  {id:2,sections:[{h2:'How to read  the Estimate',text:'b'},{h2:'When a repair is enough',text:'c'}]},
  {id:1,sections:[{h2:'When a repair is enough',text:'d'}]}];
 const {latest,earlier}=combineProposals(rows);
 assert.equal(latest.id,3);
 assert.deepEqual(earlier.map(x=>[x.id,x.sections.map(s=>s.h2)]),[[2,['When a repair is enough']]],'id 1 adds nothing new and is left out');
 assert.deepEqual(combineProposals([]),{latest:null,earlier:[]});
});

test('sections added from an earlier concept do not count as an edit of the main proposal',()=>{
 const own='<html><head><title>Roof repair</title></head><body><h1>Roof repair</h1><p>We repair roofs in the area and explain every estimate line by line.</p><h2>Our process</h2><p>We inspect first.</p></body></html>';
 const sha=require('crypto').createHash('sha256').update(own).digest('hex');
 const main={id:7,sections:[{h2:'How to read the estimate',text:'Each line of the estimate names the material, the labour and the area it covers.'}]};
 const extra={h2:'When a repair is enough',text:'A repair is enough when the damage is limited to a few shingles and the deck underneath is dry.'};
 const html=s=>'<section><h2>'+s.h2+'</h2><p>'+s.text+'</p></section>';
 const r=prepareGrowthCmsHandoff({growthProposal:main,addedProposalIds:[4],canonicalUrl:'https://synthetic.example/roof-repair/',originalHtml:own,sourceExpectedSha256:sha,
  editorApproved:true,cms:'generic',pageTitle:'Roof Repair | Synthetic Example',metaDescription:'Roof repair: how to read the estimate and when a repair is enough.',
  focusQuery:'roof repair',evidenceScope:'needs_access',
  changes:[{approved:true,evidence_ref:'growth_proposal:7',html:html(main.sections[0])},{approved:true,evidence_ref:'growth_proposal:4',html:html(extra)}]});
 assert.equal(r.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(r.issues));
 assert.deepEqual(r.manifest.growth_proposal,{id:7,editor_changed_text:false});
 assert.deepEqual(r.manifest.growth_proposals_added,[4]);
});
