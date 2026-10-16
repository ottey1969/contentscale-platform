'use strict';
// Commercial evidence, distinct from rankings/clicks. This module never reads
// private customer identities and never treats invoice issuance as paid revenue.
const ALLOWED_SOURCE=new Set(['owner_statement','redacted_invoice','payment_confirmation','crm_confirmed','first_party_analytics']);
const ALLOWED_STAGES=new Set(['inquiry_received','estimate_sent','invoice_issued','job_accepted','work_completed','payment_received']);
const ALLOWED_CHANNELS=new Set(['organic_search','google_business_profile','paid_ads','referral','repeat_customer','direct','unknown']);
function classifyCommercialEvidence(records=[],options={}){
 const rows=Array.isArray(records)?records:[],issues=[],clean=[],now=Date.parse(options.as_of||new Date().toISOString());
 const seen=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'){issues.push('INVALID_RECORD');continue;}
  const id=String(row.internal_evidence_id||'').trim(),stage=String(row.stage||'').trim();
  const source=String(row.source||'').trim(),channel=String(row.channel||'unknown').trim();
  if(!/^[a-zA-Z0-9:_-]{3,90}$/.test(id)||seen.has(id)){issues.push('EVIDENCE_ID_MISSING_OR_DUPLICATE');continue;}
  seen.add(id);
  if(!ALLOWED_STAGES.has(stage)||!ALLOWED_SOURCE.has(source)||!ALLOWED_CHANNELS.has(channel)){
   issues.push('UNSUPPORTED_EVIDENCE_STATE');continue;
  }
  const date=Date.parse(String(row.observed_at||''));
  if(!Number.isFinite(date)||!Number.isFinite(now)||date>now+86400000){issues.push('INVALID_EVIDENCE_DATE');continue;}
  // Owner attribution is not proof that a specific invoice came through Google.
  const verifiedAttribution=row.channel_verified===true&&
    ['first_party_analytics','crm_confirmed'].includes(source)&&channel!=='unknown';
  // Do not infer payment from invoice, price negotiation, or claimed completion.
  const verifiedPayment=stage==='payment_received'&&
    ['payment_confirmation','crm_confirmed'].includes(source);
  const completed=stage==='work_completed'&&source==='crm_confirmed';
  clean.push({internal_evidence_id:id,stage,channel,observed_at:new Date(date).toISOString().slice(0,10),
    source,channel_verified:verifiedAttribution,payment_verified:verifiedPayment,
    completion_verified:completed,invoice_present:stage==='invoice_issued',
    needs_stage_confirmation:['estimate_sent','invoice_issued'].includes(stage),
    needs_channel_confirmation:!verifiedAttribution});
 }
 const count=stage=>clean.filter(x=>x.stage===stage).length;
 const verifiedOrganic=clean.filter(x=>x.channel==='organic_search'&&x.channel_verified);
 const confirmedPaid=clean.filter(x=>x.payment_verified);
 return {
  status:clean.length?'EVIDENCE_RECORDED':'NO_COMMERCIAL_EVIDENCE',
  privacy:'no_customer_names_emails_addresses_or_invoice_documents',
  records:clean,
  counts:{inquiries:count('inquiry_received'),estimates:count('estimate_sent'),
    invoices_issued:count('invoice_issued'),jobs_accepted:count('job_accepted'),
    completed_verified:clean.filter(x=>x.completion_verified).length,
    payments_verified:confirmedPaid.length,verified_organic_attribution:verifiedOrganic.length},
  issues:[...new Set(issues)],
  conversion_attribution_proven:verifiedOrganic.length>0,
  paid_revenue_amount:null,
  qualified_leads_amount:null,
  next_action:clean.some(x=>x.needs_stage_confirmation)?
    'CONFIRM_INVOICE_ACCEPTED_WORK_COMPLETED_AND_PAYMENT_SEPARATELY':
    clean.some(x=>x.needs_channel_confirmation)?'VERIFY_CUSTOMER_ACQUISITION_SOURCE':
    'COMPARE_WITH_GSC_AND_GBP_OBSERVATIONS',
  explanation:'Invoices are commercial evidence, not verified SEO clicks, jobs, received payments, or attributable new customers.'
 };
}
module.exports={classifyCommercialEvidence};
