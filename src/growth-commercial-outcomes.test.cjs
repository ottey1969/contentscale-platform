'use strict';
const assert=require('node:assert/strict');
const {classifyCommercialEvidence}=require('./growth-commercial-outcomes.cjs');
const observed='2026-10-07T10:17:00Z';
let a=classifyCommercialEvidence([{
 internal_evidence_id:'private-invoice-example-1',
 stage:'invoice_issued',source:'redacted_invoice',channel:'unknown',
 observed_at:observed
}],{as_of:'2026-10-16T00:00:00Z'});
assert.equal(a.status,'EVIDENCE_RECORDED');
assert.equal(a.counts.invoices_issued,1);
assert.equal(a.counts.completed_verified,0);
assert.equal(a.counts.payments_verified,0);
assert.equal(a.counts.verified_organic_attribution,0);
assert.equal(a.conversion_attribution_proven,false);
assert.equal(a.paid_revenue_amount,null);
assert.equal(a.next_action,'CONFIRM_INVOICE_ACCEPTED_WORK_COMPLETED_AND_PAYMENT_SEPARATELY');
assert.deepEqual(Object.keys(a.records[0]).sort(),['internal_evidence_id','stage','channel','observed_at','source','channel_verified','payment_verified','completion_verified','invoice_present','needs_stage_confirmation','needs_channel_confirmation'].sort());
a=classifyCommercialEvidence([
 {internal_evidence_id:'e1',stage:'invoice_issued',source:'redacted_invoice',channel:'organic_search',
   channel_verified:true,observed_at:observed},
 {internal_evidence_id:'e2',stage:'work_completed',source:'owner_statement',channel:'unknown',
   observed_at:observed},
 {internal_evidence_id:'e3',stage:'payment_received',source:'owner_statement',channel:'unknown',
   observed_at:observed}
],{as_of:'2026-10-16T00:00:00Z'});
assert.equal(a.counts.verified_organic_attribution,0,'invoice alone must not prove SEO attribution');
assert.equal(a.counts.completed_verified,0,'owner statement is not verified completion');
assert.equal(a.counts.payments_verified,0,'owner statement is not payment confirmation');
a=classifyCommercialEvidence([
 {internal_evidence_id:'g1',stage:'inquiry_received',source:'first_party_analytics',channel:'organic_search',channel_verified:true,observed_at:observed},
 {internal_evidence_id:'c1',stage:'work_completed',source:'crm_confirmed',channel:'unknown',observed_at:observed},
 {internal_evidence_id:'p1',stage:'payment_received',source:'payment_confirmation',channel:'unknown',observed_at:observed}
],{as_of:'2026-10-16T00:00:00Z'});
assert.equal(a.counts.verified_organic_attribution,1);
assert.equal(a.counts.completed_verified,1);
assert.equal(a.counts.payments_verified,1);
assert.equal(a.paid_revenue_amount,null,'No guessed revenue from invoice amounts');
a=classifyCommercialEvidence([{internal_evidence_id:'e1',stage:'invoice_issued',source:'redacted_invoice',channel:'unknown',observed_at:'2035-01-01T00:00:00Z'}],{as_of:'2026-10-16T00:00:00Z'});
assert.equal(a.status,'NO_COMMERCIAL_EVIDENCE');
console.log('PASS: invoices are not automatically jobs, paid revenue or SEO-attributed clients; customer privacy preserved');
