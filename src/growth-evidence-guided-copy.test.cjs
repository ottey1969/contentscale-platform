'use strict';
const assert=require('node:assert/strict');
const {prepareEvidenceGuidedCopy}=require('./growth-evidence-guided-copy.cjs');
const target={url:'https://example.com/content-guide/',suitability:'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW',
body_evidence:{status:'PUBLIC_HTML_CONTENT_OBSERVED',source_truncated:false,evidence_checks:{
 inventory:true,search_data:true,decisions:false,measurement:false,worked_example:true
}}};
const a=prepareEvidenceGuidedCopy({target,query:'content scaling',protectedSource:'https://example.com/'});
assert.equal(a.status,'ONE_EDITORIAL_CANDIDATE_REQUIRES_REVIEW');
assert.equal(a.proposed_additions.length,1);
assert.equal(a.one_next_action.code,'REVIEW_ONE_POSSIBLE_GAP');
assert.equal(a.no_proven_content_gaps,true);
assert.equal(a.publish_allowed,false);
assert.equal(a.preserve_title_h1,true);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,body_evidence:{...target.body_evidence,source_truncated:true}}}).copy_ready,false);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,suitability:'SEPARATE_PRODUCT_INTENT'}}).copy_ready,false);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,body_evidence:{...target.body_evidence,evidence_checks:{inventory:true,search_data:true,decisions:true,measurement:true,worked_example:true}}}}).status,'NO_OBVIOUS_MISSING_ELEMENTS');
const duplicate={...target,body_evidence:{...target.body_evidence,observed_paragraphs:[
 'For each search question decide whether to protect update consolidate or expand an existing answer only plan a new URL when the reader needs a genuinely separate answer check overlapping existing URLs first',
 'Record the original page and query before editing after the reviewed change goes live compare equivalent measurement windows for clicks and impressions track AI citations separately'
 ]}};
const blocked=prepareEvidenceGuidedCopy({target:duplicate,query:'content scaling'});
assert.equal(blocked.status,'NO_ADDITION_POSSIBLE_DUPLICATE');
assert.equal(blocked.proposed_additions.length,0);
assert.equal(blocked.held_possible_duplicates.length,2);
assert.equal(blocked.one_next_action.code,'VERIFY_NO_CHANGE_OR_MORE_EVIDENCE');
assert.equal(blocked.publish_allowed,false);
console.log('PASS one evidence-led Growth action and likely duplicate hold, never auto publish');
