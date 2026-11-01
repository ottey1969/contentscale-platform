'use strict';
// Qualified Leads in the Opportunity Finder. LABELLED SYNTHETIC: Search Console rows per country, page HTML and enquiry
// numbers are made up for the test (no production export of them exists); no number here is a real result.
const test=require('node:test'),assert=require('node:assert/strict');
const {leadIntentOf,contactPathOf}=require('../src/growth-lead-intent.cjs');
const {findOpportunities}=require('../src/growth-opportunity-finder.cjs');
const {withLeads,validateLeadInput}=require('../src/growth-lead-measurement.cjs');
const {windowDates}=require('../src/tracker-growth-measurement.cjs');

test('intent from the words of the search term: hire, compare, information, not clear (EN, NL, FR, DE)',()=>{
 const cls=q=>leadIntentOf(q).class;
 for(const q of ['seo consultant','seo consultant amsterdam','seo bureau inhuren','seo specialist kosten','how much does an seo consultant cost','content scaling services','agence seo devis','seo agentur angebot'])assert.equal(cls(q),'HIRE',q);
 for(const q of ['best seo agency','beste seo bureau','seo agency vs freelancer','meilleure agence seo','what does an seo consultant do'])assert.equal(cls(q),'COMPARE',q);
 for(const q of ['what is content scaling','seo tips','hoe werkt seo','content scaling examples'])assert.equal(cls(q),'INFORMATION',q);
 assert.equal(cls('content scaling'),'UNCLEAR','a bare topic is not judged commercial or informational');
 assert.match(leadIntentOf('seo bureau inhuren').basis,/hiring word/);
});

test('contact path from the saved page HTML: form, link, none, unknown',()=>{
 const wrap=b=>'<html><body><h1>Service</h1><p>'+'Text about the service. '.repeat(10)+'</p>'+b+'</body></html>';
 assert.equal(contactPathOf(wrap('<form><input type="email" name="email"><textarea name="message"></textarea></form>')).status,'CONTACT_FORM');
 assert.equal(contactPathOf(wrap('<form role="search"><input type="search" name="q"></form><a href="/blog/">Blog</a>')).status,'NO_CONTACT_PATH','a search box is not a contact path');
 assert.equal(contactPathOf(wrap('<a href="/contact/">Plan a call</a>')).status,'CONTACT_LINK');
 assert.equal(contactPathOf(wrap('<a href="https://calendly.com/x/intro">Book</a>')).status,'CONTACT_LINK');
 assert.equal(contactPathOf(wrap('<a href="mailto:hello@example.com">Mail</a>')).status,'CONTACT_LINK');
 assert.equal(contactPathOf(wrap('<a href="/nl/offerte-aanvragen/">Offerte</a>')).status,'CONTACT_LINK');
 assert.equal(contactPathOf(wrap('<a href="/pricing/">Pricing</a>')).status,'NO_CONTACT_PATH');
 assert.equal(contactPathOf('').status,'UNKNOWN');
});

const pages=[{id:1,url:'https://example-seo.test/seo-consultant/',keyword:'seo consultant'},
 {id:2,url:'https://example-seo.test/blog/what-is-seo/',keyword:'what is seo'},
 {id:3,url:'https://example-seo.test/seo-audit-services/',keyword:'seo audit services'},
 {id:4,url:'https://example-seo.test/blog/seo-checklist/',keyword:'seo checklist'}];
const R=(id,query,country,impressions,clicks,position)=>({page_url:pages.find(p=>p.id===id).url,query,country,impressions,clicks,position,start_date:'2026-09-30',end_date:'2026-10-27'});
const contact=new Map([['1',{status:'CONTACT_FORM',detail:'form'}],['2',{status:'NO_CONTACT_PATH',detail:'none'}],['3',{status:'NO_CONTACT_PATH',detail:'none'}],['4',{status:'NO_CONTACT_PATH',detail:'none'}]]);
const primary=['NL','BE','LU','GB'];

test('a commercial term with less traffic comes before an informational term with much more; nothing is dropped',()=>{
 const rows=[R(2,'what is seo','GB',5000,40,9),R(1,'seo consultant','NL',45,1,12)];
 const f=findOpportunities({rows,pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary,contactPaths:contact});
 assert.equal(f.best.query,'seo consultant');assert.equal(f.best.lead_intent.class,'HIRE');assert.equal(f.best.market,'PRIMARY');
 assert.equal(f.best.next_action.code,'IMPROVE_SERVICE_PAGE');assert.match(f.best.next_action.why,/wants to hire or buy .*in a primary market \(Netherlands \(nl\)\)/);
 assert.equal(f.runners_up[0].query,'what is seo','the informational opportunity stays in the list');
 assert.equal(f.most_search_traffic.query,'what is seo');assert.match(f.most_search_traffic.why_not_first,/wants information/);
 assert(f.best.priority<f.runners_up[0].priority,'the research priority (traffic) is kept next to the lead order');
 assert.match(f.method,/no conversion rate is assumed/);assert.match(f.method,/not measured conversions/);assert.equal(f.goal,'QUALIFIED_LEADS');
 assert.equal(f.best.buyer_intent,'SERVICE_QUERY_SIGNAL');assert.equal(f.best.lead_priority_unverified,true);
 // Without the leads goal the finder keeps its research-priority order (traffic first) and adds no lead fields.
 const clicks=findOpportunities({rows,pages,domain:'example-seo.test',customerCountries:primary,contactPaths:contact});
 assert.equal(clicks.best.query,'what is seo');assert.equal(clicks.goal,'RELEVANT_CLICKS');assert.equal(clicks.best.next_action,null);assert.equal(clicks.most_search_traffic,null);
});

test('markets: primary count fully; "on evidence" needs demand in its own data and counts 0.6; others never chosen',()=>{
 const rows=[R(1,'seo consultant','US',30,0,14),R(1,'seo consultant','IN',900,2,8),R(1,'hire seo consultant','US',120,1,15),R(1,'seo consultant','BE',50,0,16)];
 const f=findOpportunities({rows,pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary,evidenceCountries:['US'],contactPaths:contact});
 const all=[f.best,...f.runners_up];
 assert(!all.some(x=>x.country==='IN'),'a country outside both lists is shown per country, never chosen');
 assert(!all.some(x=>x.country==='US'&&x.query==='seo consultant'),'30 US impressions are not enough evidence (twice the minimum is needed)');
 assert.equal(f.excluded.evidence_market_too_few_impressions,1);assert.equal(f.excluded.outside_customer_countries,1);
 const us=all.find(x=>x.country==='US');assert.equal(us.market,'ON_EVIDENCE');
 assert.equal(f.best.country,'BE','a primary market beats the same intent in a market counted on evidence');
 assert.deepEqual(f.customer_countries.on_evidence,['US']);
 // Without primary markets every country counts the same: no market is rated by itself.
 const open=findOpportunities({rows,pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',contactPaths:contact});
 assert([open.best,...open.runners_up].every(x=>x.market==='ANY'));
});

test('one next action: add a contact path, add an internal link, research a commercial search',()=>{
 const noContact=findOpportunities({rows:[R(3,'seo audit services','NL',80,0,11)],pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary,contactPaths:contact}).best;
 assert.equal(noContact.next_action.code,'ADD_CONTACT_PATH');assert.match(noContact.action,/^First give visitors of https:\/\/example-seo\.test\/seo-audit-services\/ a way to contact you/);
 const info=findOpportunities({rows:[R(4,'seo checklist','GB',400,3,7)],pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary,contactPaths:contact}).best;
 assert.equal(info.lead_intent.class,'INFORMATION');assert.equal(info.next_action.code,'ADD_INTERNAL_LINK');
 assert.equal(info.next_action.link_to,'https://example-seo.test/seo-consultant/','the service page with a contact form on the same topic');
 const fresh=findOpportunities({rows:[R(2,'seo agency rotterdam','NL',90,0,22)],pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary,contactPaths:contact}).best;
 assert.equal(fresh.kind,'POSSIBLE_NEW_PAGE');assert.equal(fresh.next_action.code,'RESEARCH_COMMERCIAL_QUERY');
 const unknown=findOpportunities({rows:[R(1,'seo consultant','NL',45,1,12)],pages,domain:'example-seo.test',goal:'QUALIFIED_LEADS',customerCountries:primary}).best;
 assert.equal(unknown.contact_path.status,'UNKNOWN');assert.match(unknown.action,/check that the page shows how to contact you/);
});

test('enquiries are never estimated: only both periods from the owner\'s own records give a change',()=>{
 const w=windowDates('2026-08-01T10:00:00Z'),rec={publication_id:7,required_windows:w};
 assert.equal(withLeads(rec,[]).leads.measured_lead_change,null);
 assert.equal(withLeads(rec,[{publication_id:7,period:'before',start_date:w.before.start,end_date:w.before.end,leads:2,source:'own_crm'}]).leads.status,'ENTER_YOUR_OWN_ENQUIRY_NUMBERS');
 const both=withLeads(rec,[{publication_id:7,period:'before',start_date:w.before.start,end_date:w.before.end,leads:2,source:'own_crm'},
  {publication_id:7,period:'after',start_date:w.after.start,end_date:w.after.end,leads:5,source:'own_contact_form'}]).leads;
 assert.deepEqual([both.status,both.before,both.after,both.measured_lead_change],['COMPARABLE_OWNER_PROVIDED_ENQUIRIES',2,5,3]);
 assert.match(both.note,/not proof that this edit caused it/);
 const now=new Date('2026-10-31T00:00:00Z'),ok={period:'after',start_date:w.after.start,end_date:w.after.end,leads:'4',source:'own_crm'};
 assert.equal(validateLeadInput(ok,w,now),null);
 assert.match(validateLeadInput({...ok,leads:'2.5'},w,now),/whole number/);
 assert.match(validateLeadInput({...ok,source:'estimate'},w,now),/your form, CRM or e-mail\/phone log/);
 assert.match(validateLeadInput({...ok,start_date:'2026-09-01'},w,now),/exact 28-day/);
});

// PostgreSQL: the "on evidence" markets are stored next to the primary markets (additive column), only when given.
const DB=process.env.GROWTH_E2E_DATABASE_URL;
test('stored markets: primary and on evidence (PostgreSQL)',{skip:!DB&&'GROWTH_E2E_DATABASE_URL not set'},async()=>{
 const {Pool}=require('pg'),pool=new Pool({connectionString:DB});
 const {setCustomerCountries,getCustomerCountries,getEvidenceCountries}=require('../src/growth-market-store.cjs');
 const {saveLeadWindow,loadLeadWindows}=require('../src/growth-lead-measurement.cjs');
 try{
  await pool.query('DROP TABLE IF EXISTS tracker_growth_customer_countries,tracker_growth_lead_windows');
  // A table from before this change (no on_evidence column) keeps working.
  await pool.query('CREATE TABLE tracker_growth_customer_countries(tracker_client_id BIGINT PRIMARY KEY,countries JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query(`INSERT INTO tracker_growth_customer_countries(tracker_client_id,countries) VALUES(91,'["NL"]')`);
  assert.deepEqual(await getEvidenceCountries(pool,{clientId:91}),[]);
  await setCustomerCountries(pool,{clientId:91,countries:['nl','be','lu','gb'],onEvidence:['us','nl']});
  assert.deepEqual(await getCustomerCountries(pool,{clientId:91}),['NL','BE','LU','GB']);
  assert.deepEqual(await getEvidenceCountries(pool,{clientId:91}),['US'],'a primary market is not also "on evidence"');
  await setCustomerCountries(pool,{clientId:91,countries:['nl','gb']});
  assert.deepEqual(await getEvidenceCountries(pool,{clientId:91}),['US'],'saving primary markets alone keeps the on-evidence list');
  await saveLeadWindow(pool,{clientId:91,publicationId:7,period:'before',startDate:'2026-07-04',endDate:'2026-07-31',leads:2,source:'own_crm'});
  await saveLeadWindow(pool,{clientId:91,publicationId:7,period:'before',startDate:'2026-07-04',endDate:'2026-07-31',leads:3,source:'own_crm'});
  assert.deepEqual((await loadLeadWindows(pool,{clientId:91})).map(r=>[r.period,r.leads]),[['before',3]],'a correction replaces the period');
 }finally{await pool.query('DROP TABLE IF EXISTS tracker_growth_customer_countries,tracker_growth_lead_windows').catch(()=>{});await pool.end()}
});
