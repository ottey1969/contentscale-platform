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

// Owner 2026-11-01: the CMS package listed nine "other concepts" (#17–#25), mostly earlier research versions of the same
// tasks in different wording. The headings and labels below are copied from the owner's screen; texts are placeholders.
test('earlier research versions of the same tasks are not offered as other concepts',()=>{
 const S=(h2,task_code)=>({h2,text:'placeholder',task_code});
 const V='TASK_GAP_AND_DRAFT_VERIFIED_FOR_REVIEW';
 const latest={id:30,evidence_label:'SELECTION_CONCEPT_FOR_REVIEW',sections:[
  {h2:'How Content Repurposing Helps You Scale Content Output',text:'p',item_id:'q-task_repurp',task:'How can content repurposing be used to scale content output?'},
  {h2:'How to Keep One Brand Voice When Several Writers Scale Content',text:'p',item_id:'q-task_styl',task:'How do I maintain brand voice and style consistency?'},
  {h2:'How Team Collaboration, Outsourcing and Batching Keep Scaled Content on Track',text:'p',item_id:'t-687ac1a85b',task:'Team collaboration and outsourcing content creation'},
  {h2:'How AI and Automation Tools Support Content Scaling',text:'p',item_id:'t-ee3f0f038f',task:'Leveraging AI and automation tools for content scaling'}]};
 const rows=[latest,
  {id:25,evidence_label:V,sections:[S('How Content Repurposing and How to Recycle Assets Scale Content Production','task_repurp'),S('How to Maintain Style and Consistency Across Writers for the Target Buyer','task_styl')]},
  {id:24,evidence_label:V,sections:[S('How Content Repurposing to Recycle Assets Scales Your Strategy','task_repurp'),S('How Writers Maintain Style and Consistency for Every Buyer','task_styl')]},
  {id:23,evidence_label:V,sections:[S('How Content Repurposing Helps Recycle Existing Assets to Scale Production','task_repurp'),S('How to Maintain Voice and Style Consistency Across Multiple Writers for Your Buyer Audience','task_styl')]},
  {id:22,evidence_label:'CANDIDATE_GAP_MEANING_NOT_VERIFIED',sections:[S('How to Implement Repetitive Workflows for Scaled Content Creation','task_repet'),S('How to Outsource Parts of Creation to External Creators While Keeping Strategy In-House','task_outso')]},
  {id:21,evidence_label:V,sections:[S('How to Use a Content Style Guide When Scaling Content','task_guide'),S('How to Outsource Parts of Content Creation to Freelancers','task_outso')]},
  {id:20,evidence_label:V,sections:[S('How Creating a Content Style Guide Helps When Scaling Content','task_guide'),S('How Outsourcing Parts of Content Creation to Freelancers Helps Scale Production','task_outso')]},
  {id:19,evidence_label:V,sections:[S('How Creating a Style Guide Helps Maintain Consistency When Scaling Content','task_guide')]},
  {id:18,evidence_label:V,sections:[S('How to Outsource Content Creation and Delegate Parts of Production to Freelancers','task_outso')]},
  {id:17,evidence_label:V,sections:[S('How to Decide Whether to Outsource Content Creation or Keep It In-House','task_outso'),S('How Batching Tasks Helps Increase Content Production Efficiency','task_batch')]}];
 const {latest:l,earlier}=combineProposals(rows);
 assert.equal(l.id,30);assert.equal(l.kind,'LATEST');
 assert(earlier.every(x=>x.kind==='EARLIER_RESEARCH_VERSION'),'none of #17–#25 is a concept the owner wrote for a selection');
 assert(!earlier.some(x=>[25,24,23].includes(x.id)),'repurposing and style versions are the same tasks as the newest concept: '+earlier.map(x=>x.id));
 assert(earlier.length<=4,'at most a few older wordings remain, folded away: '+earlier.map(x=>x.id+':'+x.sections.map(s=>s.h2).join('|')).join(' ; '));
 // A concept written for a selection on another topic stays offered as a concept.
 const sel={id:26,evidence_label:'SELECTION_CONCEPT_FOR_REVIEW',sections:[{h2:'What to Measure Each Week When You Scale',text:'p',item_id:'t-measure'}]};
 assert.equal(combineProposals([latest,sel]).earlier[0].kind,'SELECTION_CONCEPT');
});
