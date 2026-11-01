'use strict';
// Owner rule 2026-11-01: no founder, no "I"; the page speaks as the service. The first sentence below is the owner's
// current meta description wording ("my step-by-step GRAAF Framework"); the others are labelled examples.
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {validate}=require('../src/growth-seo-meta-proposal.cjs');
const codes=t=>assessDraftClaims({text:t,destinationText:''}).violations.map(v=>v.code);
test('first person and founder voice are flagged in written sections (EN, NL, FR, DE)',()=>{
 for(const t of ['Content scaling without sacrificing quality: my step-by-step GRAAF Framework to scale content production.','I review every brief before it goes out.',
  'As the founder, quality matters most.','Ik controleer elke brief zelf.','Mijn werkwijze houdt de kwaliteit hoog.','Mon équipe relit chaque texte.','Ich prüfe jeden Entwurf.'])
  assert(codes(t).includes('PERSONAL_OR_FOUNDER_VOICE'),t);
});
test('the service voice and reader advice pass',()=>{
 for(const t of ['ContentScale reviews each draft against the brief before publication.','Use one style guide so every writer follows the same rules.','You can check item i in the list.'])
  assert(!codes(t).includes('PERSONAL_OR_FOUNDER_VOICE'),t);
});
test('the SEO proposal never keeps "my" or a founder, even when the current description has it',()=>{
 const current={title:'Content Scaling In 2026: Scale Content Without Losing Quality',description:'Content scaling without sacrificing quality: my step-by-step GRAAF Framework to scale content production sustainably in the AI-search era. Free scan, no login.'};
 const r=validate(JSON.stringify({title:'Content Scaling: Grow Output Without Losing Quality',meta_description:'Content scaling without losing quality: my step-by-step GRAAF Framework to audit, repurpose and keep one brand voice across writers.'}),{query:'content scaling',current,linkUrl:null});
 assert.match(r.reason,/PERSONAL_OR_FOUNDER_VOICE/);
 assert.equal(validate(JSON.stringify({title:'Content Scaling: Grow Output Without Losing Quality',meta_description:'How to scale content without losing quality: audit first, repurpose what works, keep one brand voice across writers and use AI with the GRAAF workflow.'}),{query:'content scaling',current,linkUrl:null}).ok,true);
});
