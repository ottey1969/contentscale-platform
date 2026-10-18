'use strict';
const assert=require('node:assert/strict');
const {prepareEvidenceGuidedCopy}=require('./growth-evidence-guided-copy.cjs');
const target={url:'https://example.com/content-guide/',suitability:'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW',
body_evidence:{status:'PUBLIC_HTML_CONTENT_OBSERVED',source_truncated:false,evidence_checks:{
 inventory:true,search_data:true,decisions:false,measurement:false,worked_example:true
}}};
const a=prepareEvidenceGuidedCopy({target,query:'content scaling',protectedSource:'https://example.com/'});
assert.equal(a.status,'REVIEWABLE_DISTINCT_ADDITION_CANDIDATES');
assert.deepEqual(a.proposed_additions.map(x=>x.code),['decisions','measurement']);
assert.equal(a.no_proven_content_gaps,true);
assert.equal(a.publish_allowed,false);
assert.equal(a.preserve_title_h1,true);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,body_evidence:{...target.body_evidence,source_truncated:true}}}).copy_ready,false);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,suitability:'SEPARATE_PRODUCT_INTENT'}}).copy_ready,false);
assert.equal(prepareEvidenceGuidedCopy({target:{...target,body_evidence:{...target.body_evidence,evidence_checks:{inventory:true,search_data:true,decisions:true,measurement:true,worked_example:true}}}}).status,'NO_OBVIOUS_MISSING_ELEMENTS');
console.log('PASS Growth evidence-specific copy only on eligible complete public HTML, never auto publish');
