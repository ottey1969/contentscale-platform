'use strict';
// Growth Opportunity Finder: where can this site get the most extra RELEVANT clicks with the least responsible effort?
// It ranks (search term, country, page) from the owner's own Search Console rows per country. Facts only: impressions,
// clicks and positions as Search Console reports them; no search volume estimate, no click forecast. The priority is an
// order, not a prediction. Whether the page can beat the ranking pages is unknown until the research in that country has
// read them; the finder says so instead of scoring it. A local business stays inside its service area.
const {queryRoots}=require('./growth-reader-task-coverage.cjs');
const {countryName}=require('./growth-search-locale.cjs');

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

function findOpportunities({rows=[],pages=[],domain='',serviceArea=null,siteMarkets=null,customerCountries=[]}={}){
 const brand=compact(String(domain).replace(/^https?:\/\//,'').split('.')[0]);
 const tracked=new Map(pages.filter(p=>p&&p.url).map(p=>[norm(p.url),p]));
 const customers=new Set((customerCountries||[]).map(c=>String(c).toUpperCase()));
 const excluded={brand:0,outside_service_area:0,outside_customer_countries:0,untracked_page:0,too_few_impressions:0,protected_page:0,already_top_with_clicks:0};
 if(!rows.length)return {status:'INSUFFICIENT_DATA',reason:'No Search Console rows per country have been imported for this site. Import them in the Growth Cockpit (Search Console access is needed); without them Growth does not guess where the best opportunity is.',
  best:null,runners_up:[],by_country:[],excluded};
 const period=rows[0]&&rows[0].start_date?{start:rows[0].start_date,end:rows[0].end_date}:null;
 // Per search term and country: the page Google shows most (the best position), and every other page that also got impressions.
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
 const byCountry=new Map(),list=[];
 for(const [k,g] of groups){
  const impressions=g.reduce((n,x)=>n+x.impressions,0),clicks=g.reduce((n,x)=>n+x.clicks,0);
  const lead=g.slice().sort((a,b)=>a.position-b.position||b.impressions-a.impressions)[0];
  const c=byCountry.get(lead.country)||{country:lead.country,name:countryName(lead.country),impressions:0,clicks:0,opportunities:0,
   customer_country:customers.size?customers.has(lead.country):null};
  c.impressions+=impressions;c.clicks+=clicks;byCountry.set(lead.country,c);
  // Outside the countries where the owner wants customers: visible in the per-country overview, never the best opportunity.
  if(customers.size&&!customers.has(lead.country)){excluded.outside_customer_countries++;continue}
  if(impressions<MIN_IMPRESSIONS){excluded.too_few_impressions++;continue}
  const b=band(lead.position),ctr=impressions?clicks/impressions:0;
  if(b.kind==='SNIPPET'&&ctr>=LOW_CTR_TOP){excluded.already_top_with_clicks++;continue}
  // Which existing page is about this term? First the page Google shows, then any other tracked page; a different word
  // is no reason for a new page. Only when no tracked page covers it is a new page POSSIBLE, and even then the research of
  // the page Google shows decides (it can serve the intent, or the research advises a separate page).
  const dq=queryRoots(lead.query).distinct,topic=dq.length?dq:rootsOf(lead.query);
  const covers=p=>{const t=new Set([...rootsOf(p.keyword),...rootsOf(pathWords(p.url))]);return !topic.length||topic.filter(r=>t.has(r)).length>=Math.ceil(topic.length/2)};
  const isProtectedPage=p=>p.case_study_active===true||p.eligibility?.status==='PROTECTED';
  // The page about the term, in this order: the page whose keyword or URL has the term's own words in order (the
  // dedicated page: "content scaling" → /content-scaling/, not /content-at-scale/, which only shares a word stem), then a
  // page Google already shows for the term, then the page with fewest other words. Word stems alone never decide.
  const fit=p=>{const q=words(lead.query),k=words(p.keyword),u=words(pathWords(p.url));
   return {exact:k.join(' ')===q.join(' ')||u.join(' ')===q.join(' '),run:Math.max(run(q,k),run(q,u)),shown:g.some(x=>norm(x.page.url)===norm(p.url)),extra:rootsOf(p.keyword).length}};
  const rank=(a,b2)=>{const x=fit(a),y=fit(b2);return (y.exact-x.exact)||(y.run-x.run)||(y.shown-x.shown)||(x.extra-y.extra)};
  const candidates=pages.filter(p=>p&&p.url&&covers(p)&&!isProtectedPage(p)).sort(rank);
  const dedicated=candidates[0]||null;
  // The page Google shows stays the target when it covers the term at least as well as the best other page.
  const leadFits=covers(lead.page)&&!isProtectedPage(lead.page)&&(!dedicated||norm(dedicated.url)===norm(lead.page.url)||rank(lead.page,dedicated)<=0);
  const other=leadFits?null:dedicated&&norm(dedicated.url)!==norm(lead.page.url)?dedicated:null;
  const kind=leadFits?b.kind:other?'OTHER_EXISTING_PAGE':covers(lead.page)?b.kind:'POSSIBLE_NEW_PAGE';
  const target=kind==='OTHER_EXISTING_PAGE'?other:lead.page;
  const otherShown=other?g.find(x=>norm(x.page.url)===norm(other.url)):null;
  if(isProtectedPage(target)&&kind!=='POSSIBLE_NEW_PAGE'){excluded.protected_page++;continue}
  c.opportunities++;
  list.push({query:lead.query,country:lead.country,country_name:countryName(lead.country),page_id:target.id??null,page_url:target.url,
   shown_page_url:lead.page.url,shown_page_protected:isProtectedPage(lead.page),
   impressions,clicks,ctr_pct:Math.round(ctr*1000)/10,position:Math.round(lead.position*10)/10,kind,
   effort:kind==='POSSIBLE_NEW_PAGE'?'unknown until researched (possibly a new page)':kind==='OTHER_EXISTING_PAGE'?b.effort+', plus a link from the page Google shows':b.effort,
   other_pages:g.filter(x=>x!==lead).map(x=>({url:x.page.url,impressions:x.impressions,position:Math.round(x.position*10)/10})),
   priority:Math.round(impressions*(kind==='POSSIBLE_NEW_PAGE'?0.3:b.weight)),priority_basis:'RESEARCH_PRIORITY_NOT_A_FORECAST',
   why:impressions+' impressions and '+clicks+' clicks in '+countryName(lead.country)+(period?' ('+period.start+' – '+period.end+')':'')+', average position '+Math.round(lead.position*10)/10+' ('+b.label+')'+
    (kind==='SNIPPET'?'; only '+Math.round(ctr*1000)/10+'% of searchers click':'')+
    (kind==='OTHER_EXISTING_PAGE'?'; Google shows '+lead.page.url+' first, but '+other.url+' is the tracked page about this term'+(otherShown?' (Google shows it too, at position '+Math.round(otherShown.position*10)/10+')':''):'')+
    (kind==='POSSIBLE_NEW_PAGE'?'; no tracked page names this topic ('+lead.page.url+' is shown for it), so a separate page may be needed — the research decides':'')+
    (g.length>1?'; '+(g.length-1)+' other page(s) of the site also appear for it':'')+'.'});
 }
 list.sort((a,b)=>b.priority-a.priority||b.impressions-a.impressions);
 const countries=[...byCountry.values()].sort((a,b)=>b.impressions-a.impressions);
 if(!list.length)return {status:'INSUFFICIENT_DATA',period,customer_countries:customerScope(customers,countries),
  reason:'No search term in any country has at least '+MIN_IMPRESSIONS+' impressions on a tracked, changeable page outside the top 3 (or with few clicks in the top 3). Growth does not invent an opportunity; add pages to the Tracker or import again later.',
  best:null,runners_up:[],by_country:countries,excluded};
 const best=withPlan(list[0],siteMarkets);
 const scope=customerScope(customers,countries);
 return {status:'OPPORTUNITY_FOUND',period,customer_countries:scope,best,runners_up:list.slice(1,5).map(x=>withPlan(x,siteMarkets)),by_country:countries,excluded,
  method:'Research priority, not a forecast. Search Console per country: priority = impressions × a weight for the position band (top 3 with few clicks 0.25, positions 4–10 1, 11–20 0.7, 21–40 0.35, further 0.15; a term that needs its own page 0.3). An order, not a click forecast.',
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
 const action=o.kind==='POSSIBLE_NEW_PAGE'?(o.shown_page_protected?
  'The page Google shows is protected; start a Pre-Write brief for “'+o.query+'” with target market '+where+'. The New Page route reads the ranking pages there and checks overlap with your tracked pages before anything is written.':
  'First research '+o.page_url+' for “'+o.query+'” in '+where+': the research decides whether this existing page can serve the search, or advises a separate page. Only then a Pre-Write brief.'):
  o.kind==='OTHER_EXISTING_PAGE'?
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'; Google now shows '+o.shown_page_url+' for it, so also check the link from that page to '+o.page_url+'.':
  o.kind==='SNIPPET'?
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'; then compare your title and description with the results around you — the page is already in the top 3.':
  'Run the Growth research for '+o.page_url+' and “'+o.query+'” in '+where+'; it reads the pages that rank there and proposes the exact change, or says why none is supported.';
 return {...o,action,
  research:o.kind==='POSSIBLE_NEW_PAGE'&&o.shown_page_protected?{type:'NEW_PAGE',query:o.query,market:o.country}:{type:'EXISTING_PAGE',page_id:o.page_id,query:o.query,market:o.country},
  measurement:'After publishing, record the publication in Growth measurement. Compare the 28 days before and after in Search Console for '+o.page_url+' and “'+o.query+'”; for '+where+' the country split comes from this import ('+o.impressions+' impressions, '+o.clicks+' clicks now). No result is promised.',
  site_default_note:siteMarkets&&siteMarkets.countries&&siteMarkets.countries.length&&!siteMarkets.countries.includes(o.country)?'This opportunity is outside the site default market ('+siteMarkets.countries.join(', ')+'); the research runs in '+o.country+' for this run only.':null};
}
// A local business: most tracked pages name a US state (or the site default is one), so its service area is a hard limit.
function serviceAreaOf({pages=[],deriveMarket}){
 if(typeof deriveMarket!=='function'||!pages.length)return null;
 const local=pages.filter(p=>{try{return !!deriveMarket({query:p.keyword||'',keyword:p.keyword||'',url:p.url})}catch{return false}}).length;
 return local*2>=pages.length&&local>0?{countries:['US'],basis:local+' of '+pages.length+' tracked pages name a US state'}:null;
}
module.exports={findOpportunities,serviceAreaOf,MIN_IMPRESSIONS};
