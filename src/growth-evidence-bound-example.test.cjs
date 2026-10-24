'use strict';
const assert=require('node:assert/strict');
const {buildGrowthEvidenceExample}=require('./growth-evidence-bound-example.cjs');
const report={url:'https://site.example/',growth_decision:{primary_next_action:{query:'content scaling',metrics:{impressions:3943,clicks:2,average_position:12.7248,imported_at:'2026-10-11T11:34:03Z'}}}};
const target={decision:'DATA_BLOCKED',target_url:'https://site.example/'};
const result=buildGrowthEvidenceExample({report,decision:target});
assert.equal(result.status,'EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW');
assert.match(result.proposed_text,/3,943 impressions and 2 clicks/);
assert.match(result.proposed_text,/outside the top ten/);
assert.equal(result.evidence.measurement_window,'UNKNOWN');
assert.equal(result.gap_proven,false);
assert.equal(result.copy_ready,false);
assert.equal(result.publish_allowed,false);
assert.equal(result.target_url,target.target_url);
const crossPage=buildGrowthEvidenceExample({report,decision:{decision:'DATA_BLOCKED',target_url:'https://site.example/existing/'}});
assert.equal(crossPage.status,'DESTINATION_GSC_EVIDENCE_REQUIRED');
assert.equal(crossPage.proposed_text,undefined);
assert.equal(crossPage.copy_ready,false);
assert.equal(crossPage.non_gsc_editorial_draft_allowed,true,'Missing GSC should not be mistaken for a content-drafting block');
assert.match(crossPage.one_next_action,/drafting without GSC/);
assert.equal(crossPage.source_metrics_url,'https://site.example/');
const targetUrl='https://site.example/existing/';
const destinationRow={page_id:42,tracker_client_id:7,source_page_url:targetUrl,
 evidence_scope:'page_verified',query:'content scaling',impressions:94,clicks:4,position:8.5,imported_at:'2026-10-19T10:00:00Z'};
const verifiedTarget=buildGrowthEvidenceExample({report,decision:{decision:'DATA_BLOCKED',target_url:targetUrl},destinationGscRows:[destinationRow]});
assert.equal(verifiedTarget.status,'EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW');
assert.equal(verifiedTarget.evidence.source_url,targetUrl);
assert.equal(verifiedTarget.evidence.scope,'EXACT_DESTINATION_PAGE_VERIFIED_GSC');
assert.equal(verifiedTarget.evidence.impressions,94);
assert.equal(verifiedTarget.evidence.clicks,4);
assert.match(verifiedTarget.proposed_text,/94 impressions and 4 clicks/);
assert.doesNotMatch(verifiedTarget.proposed_text,/3,943/,'homepage metrics must not leak into destination copy');
assert.equal(verifiedTarget.copy_ready,false);
assert.equal(verifiedTarget.publish_allowed,false);
for(const invalid of [{...destinationRow,query:'other search'}, {...destinationRow,source_page_url:'https://site.example/different/'},
 {...destinationRow,evidence_scope:'site_wide'}]){
 assert.equal(buildGrowthEvidenceExample({report,decision:{decision:'DATA_BLOCKED',target_url:targetUrl},destinationGscRows:[invalid]}).status,
  'DESTINATION_GSC_EVIDENCE_REQUIRED','unverified source, query or scope must never impersonate exact destination GSC');
}
assert.equal(buildGrowthEvidenceExample({report:{...report,growth_decision:{primary_next_action:{query:'content scaling',metrics:{impressions:200,clicks:201,average_position:10}}}},decision:target}).status,'NOT_READY');
assert.equal(buildGrowthEvidenceExample({report,decision:{decision:'NO_CHANGE',target_url:target.target_url}}).status,'NOT_READY');
console.log('PASS evidence-bound example: real numbers, no invented period, no publication');
