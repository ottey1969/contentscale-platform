'use strict';
// Growth Opportunity Finder: where can this site reach the most potential customers with the least responsible effort?
// It ranks (search term, country, page) from the owner's own Search Console rows per country. Facts only: impressions,
// clicks and positions as Search Console reports them; no search volume estimate, no click forecast. The priority is an
// order, not a prediction. Whether the page can beat the ranking pages is unknown until the research in that country has
// read them; the finder says so instead of scoring it. A local business stays inside its service area.
const {queryRoots}=require('./growth-reader-task-coverage.cjs');
const {countryName}=require('./growth-search-locale.cjs');
const {leadIntentOf}=require('./growth-lead-intent.cjs');
// Qualified Leads: the order puts potential customers first. Search Console still decides whether there is an opportunity
// at all (impressions, position); the weight of that number is damped (log10), so a term with fewer impressions but a
// stronger commercial intent can come first, and an informational term stays in the list. Primary markets count fully,
// markets the owner marks "on evidence" need twice the minimum impressions and count 0.6. No market is rated by
// conversions Growth does not have.
const TOPIC_STOP=new Set(['what','how','why','when','which','the','and','for','with','guide','tips','examples','example','checklist','template','definition','meaning','best','top','free','wat','hoe','waarom','voor','met','een','het','van','les','des','pour','wie','was','und','der','die','das']);
const MARKET_WEIGHT={PRIMARY:1,ON_EVIDENCE:0.6,ANY:1};
const SERVICE_PAGE=/\b(services?|agency|consult(?:ing|ant|ants|ancy)|specialists?|experts?|hire|freelancers?|bureau|firm|diensten|specialisten|adviesbureau|pricing|prijzen|tarieven|offerte|contact|quote)\b/;

const MIN_IMPRESSIONS=20;            // in the imported 28 days, per search term and country
const LOW_CTR_TOP=0.02;              // on positions 1–3 fewer than 2% clicks: the title/description is the question
const rootsOf=t=>queryRoots(String(t||'')).all;
const compact=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const norm=u=>{try{const x=new URL(u);x.hash='';x.search='';return x.href.replace(/\/$/,'')}catch{return String(u||'').replace(/\/$/,'')}};
const words=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
const run=(a,b)=>{let best=0;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){let k=0;while(a[i+k]&&a[i+k]===b[j+k])k++;if(k>best)best=k}return best};
const pathWords=u=>{try{return decodeURIComponent(new URL(u).pathname).replace(/[^a-z0-9]+/gi,' ')}catch{return ''}};

// Position decides the kind of work and how much an improvement can move: page one but not top three is the quickest.
function band(p){
 if(p<=3)return {kind:'SNIPPET',weight:0.25,effort:'small',label:'already in the top 3'};
 if(p<=10)return {kind:'QUICK_IMPROVEMENT',weight:1,effort:'small',label:'on page one, below the top 3'};
 if(p<=20)return {kind:'QUICK_IMPROVEMENT',weight:0.7,effort:'small to medium',label:'just beyond page one'};
 if(p<=40)return {kind:'BIGGER_EFFORT',weight:0.35,effort:'medium to large',label:'on pages 3–4'};
 return {kind:'BIGGER_EFFORT',weight:0.15,effort:'large',label:'beyond page 4'};
}

// The buyer-intent signal of a search term (one classifier: growth-lead-intent), with the labels the Cockpit reports.
function buyerIntent(query){
 const i=leadIntentOf(query);
 const label=i.class==='HIRE'?(i.signals.hire?'TRANSACTIONAL_QUERY_SIGNAL':'SERVICE_QUERY_SIGNAL'):i.class==='COMPARE'?'COMPARISON_QUERY_SIGNAL':
  i.class==='INFORMATION'?'INFORMATIONAL_QUERY_SIGNAL':'UNCLASSIFIED_QUERY';
 return {label,weight:i.weight,intent:i};
}
// goal RELEVANT_CLICKS (default): the research priority order. goal QUALIFIED_LEADS (the Cockpit): potential customers first.
function findOpportunities({rows=[],pages=[],domain='',serviceArea=null,siteMarkets=null,customerCountries=[],evidenceCountries=[],contactPaths=null,goal='RELEVANT_CLICKS'}={}){
 const autoGoal=goal==='AUTO_BEST_OPPORTUNITY';
 const leadsGoal=goal==='QUALIFIED_LEADS'||autoGoal;
 const brand=compact(String(domain).replace(/^https?:\/\//,'').split('.')[0]);
 const tracked=new Map(pages.filter(p=>p&&p.url).map(p=>[norm(p.url),p]));
 const customers=new Set((customerCountries||[]).map(c=>String(c).toUpperCase()));
 const onEvidence=new Set((evidenceCountries||[]).map(c=>String(c).toUpperCase()).filter(c=>!customers.has(c)));
 const contactOf=p=>(contactPaths&&p&&(contactPaths.get?contactPaths.get(String(p.id)):contactPaths[String(p.id)]))||{status:'UNKNOWN',detail:'Not checked: the page HTML was not read for this list.'};
 const excluded={brand:0,outside_service_area:0,outside_customer_countries:0,evidence_market_too_few_impressions:0,untracked_page:0,too_few_impressions:0,protected_page:0,already_top_with_clicks:0};
 if(!rows.length)return {status:'INSUFFICIENT_DATA',reason:'No Search Console rows per country have been imported for this site. Import them in the Growth Cockpit (Search Console access is needed); without them Growth does not guess where the best opportunity is.',
  best:null,runners_up:[],by_country:[],excluded};
 const period=rows[0]&&rows[0].start_date?{start:rows[0].start_date,end:rows[0].end_date}:null;
 // Per search term and country: prefer the page with the most impressions (not the best average position); keep each URL's metrics separate.
 const groups=new Map();
 for(const r of rows){
  const page=tracked.get(norm(r.page_url));
  if(!page){excluded.untracked_page++;continue}
  if(brand.length>=4&&compact(r.query).includes(brand)){excluded.brand++;continue}
  if(serviceArea&&serviceArea.countries&&!serviceArea.countries.includes(r.country)){excluded.outside_service_area++;continue}
  const k=r.query+'|'+r.country;
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push({...r,page});
 }
 const priority=base=>Math.round(base);
 const leadEvidence=query=>leadsGoal?{goal:'QUALIFIED_LEADS',buyer_intent:buyerIntent(query).label,lead_priority_unverified:true}:{};
 const byCountry=new Map(),list=[];
 for(const [k,g] of groups){
  const impressions=g.reduce((n,x)=>n+x.impressions,0),clicks=g.reduce((n,x)=>n+x.clicks,0);
  const lead=g.slice().sort((a,b)=>b.impressions-a.impressions||a.position-b.position)[0];
  const c=byCountry.get(lead.country)||{country:lead.country,name:countryName(lead.country),impressions:0,clicks:0,opportunities:0,
   customer_country:customers.size?customers.has(lead.country):null,market:customers.has(lead.country)?'PRIMARY':onEvidence.has(lead.country)?'ON_EVIDENCE':customers.size?'OUTSIDE':'ANY'};
  c.impressions+=impressions;c.clicks+=clicks;byCountry.set(lead.country,c);
  // Outside the countries where the owner wants customers: visible in the per-country overview, never the best opportunity.
  // A market marked "on evidence" (for example the US next to NL, BE, LU and GB) counts once its own data shows demand.
  if(c.market==='OUTSIDE'){excluded.outside_customer_countries++;continue}
  if(impressions<MIN_IMPRESSIONS){excluded.too_few_impressions++;continue}
  if(c.market==='ON_EVIDENCE'&&impressions<2*MIN_IMPRESSIONS){excluded.evidence_market_too_few_impressions++;continue}
  const b=band(lead.position),ctr=lead.impressions?lead.clicks/lead.impressions:0;
  if(b.kind==='SNIPPET'&&ctr>=LOW_CTR_TOP){excluded.already_top_with_clicks++;continue}
  // Which existing page is about this term? First the page Google shows, then any other tracked page; a different word
  // is no reason for a new page. Only when no tracked page covers it is a new page POSSIBLE, and even then the research of
  // the page Google shows decides (it can serve the intent, or the research advises a separate page).
  const dq=queryRoots(lead.query).distinct,topic=dq.length?dq:rootsOf(lead.query);
  const covers=p=>{const t=new Set([...rootsOf(p.keyword),...rootsOf(pathWords(p.url))]);return !topic.length||topic.filter(r=>t.has(r)).length>=Math.ceil(topic.length/2)};
  const isProtectedPage=p=>p.case_study_active===true||p.eligibility?.status==='PROTECTED';
  // Another tracked page about the term: the one with the term's own words exactly or in the longest run in its keyword or
  // URL ("content scaling" → /content-scaling/, not /content-at-scale/ which only shares the stem), then one Google also
  // shows, then fewest other words. Word stems alone never decide.
  const fit=p=>{const q=words(lead.query),kw=words(p.keyword),u=words(pathWords(p.url));
   return {exact:kw.join(' ')===q.join(' ')||u.join(' ')===q.join(' '),run:Math.max(run(q,kw),run(q,u)),shown:g.some(x=>norm(x.page.url)===norm(p.url)),extra:rootsOf(p.keyword).length}};
  const rank=(a,b2)=>{const x=fit(a),y=fit(b2);return (y.exact-x.exact)||(y.run-x.run)||(y.shown-x.shown)||(x.extra-y.extra)};
  const candidates=pages.filter(p=>p&&p.url&&norm(p.url)!==norm(lead.page.url)&&covers(p)&&!isProtectedPage(p)).sort(rank);
  // The page Google shows most is protected (a Case Study): it is not changed, but the opportunity stays when the site has
  // a dedicated page for the term — that page becomes the target, and the numbers say which page they belong to.
  const dedicated=candidates.find(p=>{const f=fit(p);return f.exact||f.run>=words(lead.query).length})||null;
  if(isProtectedPage(lead.page)&&dedicated){
   const own=g.find(x=>norm(x.page.url)===norm(dedicated.url));
   c.opportunities++;
   list.push({query:lead.query,country:lead.country,country_name:countryName(lead.country),page_id:dedicated.id??null,page_url:dedicated.url,
    shown_page_url:lead.page.url,shown_page_protected:true,
    impressions:lead.impressions,clicks:lead.clicks,query_country_total_impressions:impressions,query_country_total_clicks:clicks,ctr_pct:Math.round(1000*lead.clicks/Math.max(1,lead.impressions))/10,position:Math.round(lead.position*10)/10,
    dedicated_page:{url:dedicated.url,impressions:own?own.impressions:0,clicks:own?own.clicks:0,position:own?Math.round(own.position*10)/10:null},
    kind:'DEDICATED_PAGE_FOR_PROTECTED',effort:'medium (the dedicated page must become the one Google shows)',
    other_pages:g.filter(x=>x!==lead).map(x=>({url:x.page.url,impressions:x.impressions,position:Math.round(x.position*10)/10})),
    priority:priority(lead.impressions*b.weight*0.7),...leadEvidence(lead.query),priority_basis:'RESEARCH_PRIORITY_NOT_A_FORECAST',
    why:'Google shows the protected page '+lead.page.url+' most for this term: '+lead.impressions+' impressions and '+lead.clicks+' clicks in '+countryName(lead.country)+(period?' ('+period.start+' – '+period.end+')':'')+', average position '+Math.round(lead.position*10)/10+
     '. The site\'s own page about the term is '+dedicated.url+(own?' ('+own.impressions+' impressions, '+own.clicks+' clicks, position '+Math.round(own.position*10)/10+')':' (no impressions for it in this import)')+
     '. These numbers belong to the pages named; none is attributed to the other.'});
   continue;
  }
  const other=covers(lead.page)?null:candidates[0]||null;
  const kind=covers(lead.page)?b.kind:other?'OTHER_EXISTING_PAGE':'POSSIBLE_NEW_PAGE';
  const target=lead.page; // Evidence belongs to the observed URL; a different page is only a candidate.
  if(isProtectedPage(target)&&kind!=='POSSIBLE_NEW_PAGE'){excluded.protected_page++;continue}
  c.opportunities++;
  list.push({query:lead.query,country:lead.country,country_name:countryName(lead.country),page_id:target.id??null,page_url:target.url,
   shown_page_url:lead.page.url,shown_page_protected:isProtectedPage(lead.page),
   impressions:lead.impressions,clicks:lead.clicks,query_country_total_impressions:impressions,query_country_total_clicks:clicks,ctr_pct:Math.round(1000*lead.clicks/Math.max(1,lead.impressions))/10,position:Math.round(lead.position*10)/10,kind,
   effort:kind==='POSSIBLE_NEW_PAGE'?'unknown until researched (possibly a new page)':kind==='OTHER_EXISTING_PAGE'?b.effort+', plus a link from the page Google shows':b.effort,
   other_pages:g.filter(x=>x!==lead).map(x=>({url:x.page.url,impressions:x.impressions,position:Math.round(x.position*10)/10})),
   priority:priority(lead.impressions*(kind==='POSSIBLE_NEW_PAGE'?0.3:b.weight)),...leadEvidence(lead.query),priority_basis:'RESEARCH_PRIORITY_NOT_A_FORECAST',
   why:lead.impressions+' impressions and '+lead.clicks+' clicks for '+lead.page.url+' in '+countryName(lead.country)+(period?' ('+period.start+' – '+period.end+')':'')+', average position '+Math.round(lead.position*10)/10+' ('+b.label+')'+
    (kind==='SNIPPET'?'; only '+Math.round(ctr*1000)/10+'% of searchers click':'')+
    (kind==='OTHER_EXISTING_PAGE'?'; another tracked page ('+other.url+') may also serve this term; verify intent before choosing a destination':'')+
    (kind==='POSSIBLE_NEW_PAGE'?'; no tracked page names this topic ('+lead.page.url+' is shown for it), so a separate page may be needed — the research decides':'')+
    (g.length>1?'; '+(g.length-1)+' other page(s) of the site also appear for it; these pages together have '+impressions+' impressions and '+clicks+' clicks':'')+'.'});
 }
 // Qualified Leads order: commercial intent × market × damped research priority. The contact path does not change the
 // order (a commercial page without one is an opportunity, not a worse page); it decides the first action.
 for(const o of leadsGoal?list:[]){
  const market=byCountry.get(o.country)?.market||'ANY',intent=leadIntentOf(o.query);
  const page=pages.find(p=>String(p.id)===String(o.page_id))||{id:o.page_id,url:o.page_url};
  o.lead_intent=intent;o.market=market;o.contact_path=contactOf(page);
  o.lead_priority=Math.round(100*intent.weight*MARKET_WEIGHT[market]*Math.log10(1+o.priority))/100;
  // An informational term: a tracked page on the same topic where visitors can contact you is the next step for the reader.
  if(intent.class==='INFORMATION'||intent.class==='UNCLEAR'){
   // Topic words of 3+ letters (short subject words such as "seo" count), without question and learning words.
   const topic=words(o.query).filter(w=>w.length>=3&&!TOPIC_STOP.has(w));
   const service=pages.filter(p=>p&&p.url&&norm(p.url)!==norm(o.page_url)&&p.case_study_active!==true&&SERVICE_PAGE.test((String(p.keyword||'')+' '+pathWords(p.url)).toLowerCase())
    &&/^CONTACT_/.test(contactOf(p).status)&&topic.some(w=>new Set([...words(p.keyword),...words(pathWords(p.url))]).has(w)))
    .sort((a,b)=>String(a.url).length-String(b.url).length)[0];
   if(service)o.lead_page={page_id:service.id??null,url:service.url,contact_path:contactOf(service)};
  }
 }
 // Automatic mode compares BOTH opportunities on the same 0–1 scale. Commercial intent cannot
 // erase an exceptional traffic opportunity, and raw clicks alone cannot dominate buyer intent.
 if(autoGoal&&list.length){
  const maxLead=Math.max(...list.map(o=>o.lead_priority),0.01);
  const maxTraffic=Math.max(...list.map(o=>Math.log10(1+Math.max(0,o.priority))),0.01);
  for(const o of list){
   const buyer=o.lead_priority/maxLead,traffic=Math.log10(1+Math.max(0,o.priority))/maxTraffic;
   o.automatic_priority=Math.round(1000*(0.6*buyer+0.4*traffic))/1000;
   o.automatic_basis={buyer_signal:Math.round(buyer*100)/100,search_opportunity:Math.round(traffic*100)/100,
    note:'Relative research priority, not predicted leads or clicks; both opportunities remain visible.'};
  }
 }
 list.sort((a,b)=>(autoGoal?b.automatic_priority-a.automatic_priority:leadsGoal?b.lead_priority-a.lead_priority:0)||b.priority-a.priority||b.impressions-a.impressions);
 const countries=[...byCountry.values()].sort((a,b)=>b.impressions-a.impressions);
 if(!list.length)return {status:'INSUFFICIENT_DATA',period,customer_countries:customerScope(customers,countries),
  reason:'No search term in any country has at least '+MIN_IMPRESSIONS+' impressions on a tracked, changeable page outside the top 3 (or with few clicks in the top 3). Growth does not invent an opportunity; add pages to the Tracker or import again later.',
  best:null,runners_up:[],by_country:countries,excluded};
 const best=withPlan(list[0],siteMarkets);
 const scope={...customerScope(customers,countries),on_evidence:[...onEvidence]};
 // The opportunity with the most search traffic, shown when the lead order chose another one, so nothing is hidden.
 const byTraffic=list.slice().sort((a,b)=>b.priority-a.priority||b.impressions-a.impressions)[0];
 return {status:'OPPORTUNITY_FOUND',period,customer_countries:scope,best,runners_up:list.slice(1,5).map(x=>withPlan(x,siteMarkets)),by_country:countries,excluded,
  goal:autoGoal?'AUTO_BEST_OPPORTUNITY':leadsGoal?'QUALIFIED_LEADS':'RELEVANT_CLICKS',
  most_search_traffic:leadsGoal&&byTraffic!==list[0]?{query:byTraffic.query,country:byTraffic.country,page_url:byTraffic.page_url,impressions:byTraffic.impressions,
   lead_intent:byTraffic.lead_intent.class,why_not_first:'More search traffic, but '+byTraffic.lead_intent.label+(byTraffic.market==='ON_EVIDENCE'?' in a market you count on evidence':'')+
    '; “'+list[0].query+'” is closer to a customer ('+list[0].lead_intent.label+').'}:null,
  method:autoGoal?'Automatic priority blends relative commercial-search intent (60%) and relative GSC traffic opportunity (40%); all candidates are compared within the selected markets. This is research ordering, never a prediction of leads or clicks. Both underlying signals remain visible.':leadsGoal?'Qualified-lead research priority, not measured conversions. Lead priority = intent weight (wants to hire 1, compares providers 0.8, not clear 0.5, wants information 0.35) × market weight (primary 1, on evidence 0.6) × log10(1 + research priority). Research priority = impressions × a weight for the position band (top 3 with few clicks 0.25, positions 4–10 1, 11–20 0.7, 21–40 0.35, further 0.15; a term that needs its own page 0.3). Intent is read from the words of the search term only; no conversion rate is assumed and no leads or sales are inferred.':
   'Research priority, not a forecast. Search Console per country: priority = impressions × a weight for the position band (top 3 with few clicks 0.25, positions 4–10 1, 11–20 0.7, 21–40 0.35, further 0.15; a term that needs its own page 0.3). An order, not a click forecast.',
  not_yet_known:'How strong the ranking pages are in that country, and whether this page can give a better answer: the Growth research in that country reads them before anything is proposed.'};
}
function customerScope(customers,countries){
 const outside=countries.filter(c=>customers.size&&!customers.has(c.country));
 return customers.size?{set:true,countries:[...customers],
  outside:outside.slice(0,6).map(c=>({country:c.country,name:c.name,impressions:c.impressions,clicks:c.clicks})),
  note:'Only the countries you chose count for the best opportunity'+(outside.length?'; '+outside.length+' other countr'+(outside.length===1?'y':'ies')+' with impressions are shown for information':'')+'.'}:
  {set:false,countries:[],outside:[],note:'Every country counts until you choose the countries where your customers are. Impressions are not customers: set them so the finder only picks opportunities you can serve.'};
}
function withPlan(o,siteMarkets){
 const where=o.country_name+' ('+o.country.toLowerCase()+')';
 const action=o.kind==='DEDICATED_PAGE_FOR_PROTECTED'?
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'. The protected page '+o.shown_page_url+' is not changed; check that it links to '+o.page_url+' with words that name the term, so Google can show the dedicated page.':
  o.kind==='POSSIBLE_NEW_PAGE'?(o.shown_page_protected?
  'The page Google shows is protected; start a Pre-Write brief for “'+o.query+'” with target market '+where+'. The New Page route reads the ranking pages there and checks overlap with your tracked pages before anything is written.':
  'First research '+o.page_url+' for “'+o.query+'” in '+where+': the research decides whether this existing page can serve the search, or advises a separate page. Only then a Pre-Write brief.'):
  o.kind==='OTHER_EXISTING_PAGE'?
  'Research the page Google shows, '+o.page_url+', for “'+o.query+'” in '+where+'; compare its intent with other tracked pages before choosing a destination or suggesting internal links.':
  o.kind==='SNIPPET'?
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'; then compare your title and description with the results around you — the page is already in the top 3.':
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'; it reads the pages that rank there and proposes the exact change, or says why none is supported.';
 const next=o.lead_intent?nextActionOf(o,where,action):null;
 return {...o,action:next?next.text:action,research_action:action,next_action:next,
  research:o.kind==='POSSIBLE_NEW_PAGE'&&o.shown_page_protected?{type:'NEW_PAGE',query:o.query,market:o.country}:{type:'EXISTING_PAGE',page_id:o.page_id,query:o.query,market:o.country},
  measurement:'After publishing, record the publication in Growth measurement. Visibility and clicks: compare the 28 days before and after in Search Console for '+o.page_url+' and “'+o.query+'”; for '+where+' the country split comes from this import ('+o.impressions+' impressions, '+o.clicks+' clicks now). Enquiries: enter the contact requests from your own form, e-mail or CRM for the same two periods; Growth does not estimate them. No result is promised.',
  site_default_note:siteMarkets&&siteMarkets.countries&&siteMarkets.countries.length&&!siteMarkets.countries.includes(o.country)?'This opportunity is outside the site default market ('+siteMarkets.countries.join(', ')+'); the research runs in '+o.country+' for this run only.':null};
}
// One next action for the editor: which page, why it matters commercially, and the first thing to do.
function nextActionOf(o,where,researchAction){
 const intent=o.lead_intent||leadIntentOf(o.query),cp=o.contact_path||{status:'UNKNOWN'},commercial=intent.class==='HIRE'||intent.class==='COMPARE';
 const why='“'+o.query+'”: '+intent.label+' ('+intent.basis.replace(/\.$/,'').replace(/^The /,'the ')+')'+(o.market==='PRIMARY'?', in a primary market ('+where+')':o.market==='ON_EVIDENCE'?', in '+where+', a market you count when its data shows demand':'')+'.';
 if(o.kind==='POSSIBLE_NEW_PAGE'&&commercial)
  return {code:'RESEARCH_COMMERCIAL_QUERY',page_url:o.page_url,why,text:'Research the commercial search “'+o.query+'” in '+where+': no tracked page is about it yet. '+researchAction};
 if(commercial&&cp.status==='NO_CONTACT_PATH')
  return {code:'ADD_CONTACT_PATH',page_url:o.page_url,why,text:'First give visitors of '+o.page_url+' a way to contact you (a contact link, booking link or short form near the offer): '+cp.detail+' Then: '+researchAction};
 if(commercial)
  return {code:'IMPROVE_SERVICE_PAGE',page_url:o.page_url,why,text:'Improve '+o.page_url+' for “'+o.query+'”: someone searching this is close to an enquiry. '+researchAction+
   (cp.status==='UNKNOWN'?' Also check that the page shows how to contact you (the Tracker has no saved HTML to check).':'')};
 if(o.lead_page)
  return {code:'ADD_INTERNAL_LINK',page_url:o.page_url,link_to:o.lead_page.url,why,text:'Add a link from '+o.page_url+' to '+o.lead_page.url+' where the answer naturally leads to working with you, so readers of “'+o.query+'” find the page where they can contact you. '+researchAction};
 return {code:o.kind==='POSSIBLE_NEW_PAGE'?'RESEARCH_QUERY':'IMPROVE_PAGE',page_url:o.page_url,why,text:researchAction+(intent.class==='INFORMATION'?' This term is informational: no tracked page on the same topic with a contact path was found to link to.':'')};
}
// A local business: most tracked pages name a US state (or the site default is one), so its service area is a hard limit.
function serviceAreaOf({pages=[],deriveMarket}){
 if(typeof deriveMarket!=='function'||!pages.length)return null;
 const local=pages.filter(p=>{try{return !!deriveMarket({query:p.keyword||'',keyword:p.keyword||'',url:p.url})}catch{return false}}).length;
 return local*2>=pages.length&&local>0?{countries:['US'],basis:local+' of '+pages.length+' tracked pages name a US state'}:null;
}
module.exports={findOpportunities,serviceAreaOf,nextActionOf,MIN_IMPRESSIONS,buyerIntent};
