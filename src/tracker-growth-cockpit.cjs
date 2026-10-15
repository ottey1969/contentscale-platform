'use strict';
const {URL}=require('node:url');
const {classifyGrowthSearchIntent}=require('./growth-search-intent.cjs');
const escapeHtml=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function bucket(q,brand){
 const k=norm(q);
 if(!k)return 'unknown';
 // Brand names in Tracker are usually passed as a domain. Comparing the whole
 // "perfectroofingteamcom" against the query misses "perfect roofing team".
 // Normalize the registrable site's first hostname label as the brand stem.
 const raw=String(brand||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
 const domainStem=norm(raw.split('.')[0]).replace(/ /g,'');
 const n=k.replace(/ /g,'');
 if(n.includes('contentscale')||n.includes('contentatscale')||k.includes('content scale')||k.includes('content at scale')||k==='content scaling'||k==='scale content'||k==='sites at scale')
  return 'brand_or_ambiguous';
 if(domainStem.length>=6&&n.includes(domainStem))return 'brand_or_ambiguous';
 // Common user searches abbreviate company names by omitting the final
 // legal/crew term; treat these as ambiguous instead of promising nonbrand leads.
 if(domainStem.length>=10&&n.length>=8&&n!==domainStem&&domainStem.startsWith(n)&&k.split(' ').length>=2)return 'brand_or_ambiguous';
 return 'non_brand';
}
function host(url){try{return new URL(url).hostname.toLowerCase()}catch{return ''}}
function computeGrowth(rows,queries,domain,now=new Date()){
 const expected=host('https://'+String(domain||'').replace(/^https?:\/\//,'').split('/')[0]);
 const pages=rows.filter(p=>host(p.url)===expected).map(p=>{
  const impressions=Number(p.gsc_impressions)||0,clicks=Number(p.gsc_clicks)||0,position=Number(p.gsc_position)||0;
  const ctr=impressions?100*clicks/impressions:0;
  const completed=p.brief_content&&typeof p.brief_content==='object'&&Number(p.brief_content.outstanding_actions)===0;
  const opportunity=(impressions>=300&&position>20&&clicks<=Math.max(2,impressions*0.002))?'RANKING_GAP':
    (impressions>=200&&position>0&&position<=20&&ctr<0.5)?'CTR_REVIEW':'MEASURE';
  const priority=opportunity==='RANKING_GAP'?Math.round(impressions*Math.min(2,position/20)):
    opportunity==='CTR_REVIEW'?impressions:0;
  return {id:p.id,url:p.url,keyword:p.keyword||'',impressions,clicks,position,ctr:Number(ctr.toFixed(3)),
   opportunity,priority,case_study_active:!!p.case_study_active,brief_complete:completed,
   next_action:opportunity==='RANKING_GAP'?'Inspect page-query intent, relevant ranking competitors, content distinction and internal linking':
    opportunity==='CTR_REVIEW'?'Inspect non-brand exact-page queries, SERP layout and snippet suitability':'Collect comparable fresh GSC evidence'};
 }).sort((a,b)=>b.priority-a.priority);
 const ids=new Set(pages.map(p=>String(p.id)));
 const latest=new Map();
 for(const q of queries.filter(x=>ids.has(String(x.page_id))&&x.evidence_scope==='page_verified')){
  const key=String(q.page_id)+'|'+norm(q.query);
  const at=Date.parse(q.imported_at)||0;
  if(!latest.has(key)||at>latest.get(key).at)latest.set(key,{...q,at});
 }
 const classified=[...latest.values()].filter(q=>q.at&&q.at<=now.getTime()&&now.getTime()-q.at<=75*86400000)
  .map(q=>({...q,classification:bucket(q.query,domain)}));
 const nonBrand=classified.filter(q=>q.classification==='non_brand');
 const brand=classified.filter(q=>q.classification==='brand_or_ambiguous');
 // Prioritize click opportunities from verified non-branded PAGE queries, not
 // property-wide figures or guessed CTR increases. One row per page/query.
 const queryOpportunities=nonBrand.filter(q=>Number(q.impressions)>=80&&Number(q.position)>0)
  .map(q=>{
   const page=pages.find(p=>String(p.id)===String(q.page_id));
   const pos=Number(q.position),impressions=Number(q.impressions),clicks=Number(q.clicks)||0;
   const ctr=impressions?clicks/impressions:0;
   const type=pos<=10&&ctr<0.01?'SNIPPET_AND_INTENT_REVIEW':
    pos>10&&pos<=20?'STRIKING_DISTANCE':
    pos>20&&pos<=50?'RANKING_AND_CONTENT':'LONG_TERM_VISIBILITY';
   const score=impressions*(pos<=20?1.5:pos<=50?1:0.35)*(clicks<=2?1.15:1);
   const checklist=type==='SNIPPET_AND_INTENT_REVIEW'
    ? ['Open Google results for this exact query and confirm whether the user intent matches the page','Check the real title/snippet shown and compare the three leading results','Improve the page title and introductory answer only if evidence shows a mismatch','Record publish date and compare equivalent page-query GSC periods']
    : type==='STRIKING_DISTANCE'
    ? ['Compare the top-ranking results and their search intent against this exact page','Identify factual information, first-hand examples or helpful sections genuinely missing','Add relevant contextual internal links from existing related pages','Publish only verified improvements and measure page-query clicks after indexing']
    : ['Verify the exact query intent against the current page and live search results','Compare competitor coverage and identify real, non-duplicative gaps','Improve the existing page and connect relevant hub/spoke internal links','Capture a comparable 28-day GSC baseline before publication and review again after'];
   return {page_id:q.page_id,url:page?.url||'',query:String(q.query),impressions,clicks,imported_at:q.imported_at||null,
    position:Number(pos.toFixed(1)),ctr:Number((ctr*100).toFixed(2)),type,priority_score:Math.round(score),
    case_study_locked:!!page?.case_study_active,checklist,
    action:type==='SNIPPET_AND_INTENT_REVIEW'?'Review the actual SERP appearance, search intent, title and description; do not promise snippet CTR gains':
      type==='STRIKING_DISTANCE'?'Compare top-10 competitor evidence, page content and contextual internal links':
      type==='RANKING_AND_CONTENT'?'Verify intent match, competitive content gaps and internal-link support before changing this page':
      'Research whether this query fits the page before investing in new content'};
  }).filter(x=>x.url).sort((a,b)=>b.priority_score-a.priority_score).slice(0,30);
 const sum=arr=>arr.reduce((acc,x)=>({impressions:acc.impressions+(Number(x.impressions)||0),clicks:acc.clicks+(Number(x.clicks)||0)}),{impressions:0,clicks:0});
 return {domain:expected,mode:'GROWTH_READ_ONLY',generated_at:now.toISOString(),
  scope:'Latest verified exact-page GSC query rows (up to 75 days old), not a fixed 28-day trend',
  non_brand:sum(nonBrand),brand_or_ambiguous:sum(brand),
  evidence_queries:classified.length,query_opportunities:queryOpportunities,pages,case_study_policy:'READ_ONLY_NO_SCAN_NO_BASELINE_MUTATION'};
}
// Produces an owner-facing opportunity report, not a fabricated success story.
// A distinct dated measurement report lives at /growth/measurement.
function buildGrowthClientBrief(g){
 const top=g.query_opportunities.find(q=>!q.case_study_locked);
 const intent=top?classifyGrowthSearchIntent(top.query):null;
 const latest=g.query_opportunities.map(q=>q.imported_at).filter(Boolean).sort().at(-1)||null;
 const lines=[
  'CONTENTSCALE GROWTH — VERIFIED CLICK OPPORTUNITY',
  'Website: '+g.domain,
  'Report generated: '+g.generated_at,
  'Status: '+(top?'EVIDENCE-BASED IMPROVEMENT OPPORTUNITY':'MORE PAGE-VERIFIED RESEARCH REQUIRED'),
  'Data scope: latest saved page-specific verified GSC query records; NOT a fixed date-window trend.',
  'Latest recorded query import: '+(latest||'not available'),
  'Non-branded query impressions (NOT unique visitors): '+g.non_brand.impressions,
  'Non-branded organic clicks: '+g.non_brand.clicks,
  'Branded/ambiguous query clicks: '+g.brand_or_ambiguous.clicks,
  'Qualified calls, forms and customer inquiries: NOT MEASURED in this report.',
  'Company-wide jobs and paid revenue: NOT MEASURED in this Search Console report.',
  'Important: zero clicks to a specific landing page does NOT mean the company has no customers or jobs.',
  'An issued invoice alone does NOT verify completed work, payment, or a Google-originated lead.',
  '',
  top?'PRIORITY QUERY: '+top.query:'NEXT ACTION: Import fresh exact-page Search Console queries.',
  top?'Existing URL: '+top.url:'',
  top?'Search Console: '+top.impressions+' impressions; '+top.clicks+' clicks; average position '+top.position:'',
  top?'Opportunity type: '+top.type:'',
  intent?'Search intent: '+intent.intent:'',
  intent?'Appropriate contact goal: '+intent.goal:'',
  intent?'Intent-specific page action: '+intent.next_action:'',
  top?'Recommended next step: '+top.action:'',
  '',
  'WHAT WE WILL DO:',
  '1. Check the real search intent and ranking competitors for the selected query.',
  '2. Preserve the existing page and design; add only useful, differentiated, verifiable improvements.',
  '3. Verify rendered desktop/mobile output and get editorial approval before publishing.',
  '4. Record the actual publication; compare equal, non-overlapping, dated GSC page-query windows.',
  '5. Where available, separately measure phone calls, inquiries and attributable jobs.',
  '6. Ask whether slow business means too few new inquiries or too few confirmed jobs; verify acquisition channels independently.',
  '',
  'EVIDENCE LIMITATIONS:',
  '- Visibility and rankings do not prove traffic or customer acquisition.',
  '- Google Business Profile call-button clicks are not verified conversations, and callers may never visit the website.',
  '- Actual calls, qualified inquiries, estimates and won jobs require their own evidence sources and matching time periods.',
  '- No universal conversion percentage (including claims of 80% pre-sold visitors) applies across search intents.',
  '- A business owner may handle pricing and closing; the Growth report does not infer the reason a lead was lost.',
  '- Ask for real job photos and authentic customer feedback with permission; never generate fictional jobs or filtered reviews.',
  '- These are the latest imported page-query observations; do not compare them as equal periods.',
  '- No future clicks, ranking gains, job revenue or causal impact are guaranteed.',
  '- Existing Case Studies are read-only during their protected measurement cycle.'
 ];
 return lines.filter(x=>x!==undefined).join('\n');
}

function registerGrowthCockpit(app,pool){
 async function data(req,res,next){
  try{
   const cr=await pool.query("SELECT id,name,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token]);
   if(!cr.rows.length)return res.status(404).json({success:false,error:'Tracker not found'});
   const client=cr.rows[0];
   const [p,q]=await Promise.all([
    pool.query(`SELECT p.id,p.url,p.keyword,p.gsc_impressions,p.gsc_clicks,p.gsc_position,p.brief_content,
      EXISTS(SELECT 1 FROM tracker_case_studies cs WHERE cs.tracker_page_id=p.id AND cs.tracker_client_id=$1 AND cs.status='active') AS case_study_active
      FROM tracker_pages p WHERE p.tracker_client_id=$1 ORDER BY p.gsc_impressions DESC NULLS LAST LIMIT 1000`,[client.id]),
    pool.query(`SELECT q.page_id,q.query,q.clicks,q.impressions,q.position,q.imported_at,q.evidence_scope
      FROM tracker_gsc_queries q WHERE q.tracker_client_id=$1 AND q.evidence_scope='page_verified'
      ORDER BY q.imported_at DESC LIMIT 5000`,[client.id])
   ]);
   req.growth=computeGrowth(p.rows,q.rows,client.domain);
   req.growth.client_id=client.id;
   next();
  }catch(e){res.status(503).json({success:false,error:'Verified growth evidence temporarily unavailable'})}
 }
 app.get('/api/tracker-client/:token/growth',data,(req,res)=>res.json({success:true,...req.growth}));
 app.get('/api/tracker-client/:token/growth/brief',data,(req,res)=>{
  const id=String(req.query&&req.query.page_id||'');
  const query=norm(req.query&&req.query.query);
  const choice=req.growth.query_opportunities.find(q=>String(q.page_id)===id&&norm(q.query)===query);
  if(!choice)return res.status(404).type('text').send('Verified opportunity not found');
  const lines=[
    'CONTENTSCALE — EVIDENCE-BASED GROWTH EXECUTION BRIEF',
    'Page: '+choice.url,
    'Exact query: '+choice.query,
    'Verified GSC query evidence: '+choice.impressions+' impressions; '+choice.clicks+' clicks; average position '+choice.position,
    'Source: latest saved page-verified GSC rows; not a fixed 28-day period or traffic forecast',
    'Diagnosis: '+choice.type,
    'Research objective: '+choice.action,
    'Case Study restriction: '+(choice.case_study_locked?'RESEARCH ONLY — do not publish or alter a locked baseline':'Publish only after human review'),
    '',
    'CHECKLIST',
    ...choice.checklist.map((step,i)=>(i+1)+'. '+step),
    '',
    'BEFORE PUBLISHING',
    '- Compare the actual page content and competing search results; do not invent findings.',
    '- Do not redirect, canonicalize, shorten or add spokes without evidence of a conflicting search intent.',
    '- Record the actual edit and publication timestamp separately from the Case Study baseline.',
    '- Capture an equal-length GSC comparison window after enough data becomes available.',
    '',
    'STATUS: research proposal; no scan, publication, or customer-site change performed.'
  ];
  res.set('Cache-Control','no-store').type('text/plain; charset=utf-8').send(lines.join('\n'));
 });
 app.get('/api/tracker-client/:token/growth/client-brief',data,(req,res)=>{
  res.set('Cache-Control','private, no-store').type('text/plain; charset=utf-8')
    .send(buildGrowthClientBrief(req.growth));
 });
 app.get('/track/:token/growth/client-brief',data,(req,res)=>{
  const report=buildGrowthClientBrief(req.growth);
  res.set('Cache-Control','private, no-store').type('html').send(
   '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>ContentScale Growth — Client Opportunity Brief</title>'+
   '<style>body{font:16px/1.55 system-ui;margin:24px auto;max-width:900px;padding:15px;color:#15233a;background:#f6f8fc}main{background:#fff;border:1px solid #dae2ed;padding:24px;border-radius:12px}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}a{color:#1d4ed8}</style></head><body>'+
   '<p><a href="/track/'+encodeURIComponent(req.params.token)+'/growth">← Growth Cockpit</a></p><main><h1>Verified Growth Opportunity Brief</h1>'+
   '<p>This is a documented improvement opportunity, not proof of results yet.</p><pre>'+escapeHtml(report)+'</pre>'+
   '</main></body></html>'
  );
 });
 app.get('/track/:token/growth',data,(req,res)=>{
  const g=req.growth;
  const row=x=>`<tr><td><a href="${escapeHtml(x.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(x.url)}</a><small>${escapeHtml(x.keyword)}</small></td><td>${x.impressions.toLocaleString()}</td><td>${x.clicks}</td><td>${x.ctr.toFixed(2)}%</td><td>${x.position.toFixed(1)}</td><td>${escapeHtml(x.opportunity)}${x.case_study_active?' · Case Study locked':''}<small>${escapeHtml(x.next_action)}</small></td></tr>`;
  res.set('Cache-Control','no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Growth Cockpit</title><style>body{font:15px/1.5 system-ui;background:#f6f8fc;color:#172337;max-width:1150px;margin:auto;padding:24px}h1{font-size:27px}.stats{display:flex;gap:14px;flex-wrap:wrap}.stats section{background:#fff;border:1px solid #d9e0eb;border-radius:12px;padding:16px;min-width:190px}.stats strong{display:block;font-size:25px}table{background:white;border-collapse:collapse;width:100%;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #e0e5ef;padding:12px}small{display:block;color:#64748b}a{color:#1d4ed8;overflow-wrap:anywhere}.note{background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:10px}th{background:#eaf0fa}label{display:block;margin:8px 0}input,textarea{display:block;width:100%;max-width:550px;padding:9px;margin:4px 0;border:1px solid #cbd5e1;border-radius:7px}button{background:#168347;color:white;border:0;border-radius:7px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5}@media(max-width:680px){table{display:block;overflow-x:auto}}</style></head><body><p><a href="/track/${encodeURIComponent(req.params.token)}">← Tracker</a></p><h1>Growth Cockpit</h1><p>${escapeHtml(g.domain)} · read-only evidence · no automatic scans or publishing</p><div class="stats"><section>Non-brand verified clicks<strong>${g.non_brand.clicks.toLocaleString()}</strong></section><section>Non-brand impressions<strong>${g.non_brand.impressions.toLocaleString()}</strong></section><section>Brand / ambiguous clicks<strong>${g.brand_or_ambiguous.clicks.toLocaleString()}</strong></section><section>Verified query rows<strong>${g.evidence_queries}</strong></section></div><p class="note">These are latest saved query-level records, not a period-over-period growth claim. Brand-ambiguous phrases are excluded from non-brand totals. Case Study baselines remain untouched. Improve existing pages before approving a new spoke.</p><p><a href="/track/${encodeURIComponent(req.params.token)}/growth/measurement" target="_blank" rel="noopener noreferrer">View publication measurement readiness</a> — checks whether published changes can be measured honestly. Missing GSC date ranges are never treated as proof of click growth.</p><section class="note"><strong>One recommended next action</strong><p>${escapeHtml(g.query_opportunities.find(x=>!x.case_study_locked)?.action||'Import fresh verified GSC page-query data first.')}</p><p><a href="/track/${encodeURIComponent(req.params.token)}/growth/client-brief">Open owner-ready Growth Opportunity Brief</a> — based only on actual evidence, never a promise of clicks.</p></section><p><a href="/growth/cms-handoff?client_id=${encodeURIComponent(g.client_id)}&page_id=${encodeURIComponent(g.query_opportunities.find(x=>!x.case_study_locked)?.page_id||'')}">Download CMS-onafhankelijk Growth-opleverpakket (Wix, WordPress of andere website)</a> — alleen voor aangemelde ContentScale-beheerders; geen WordPress-verbinding of betaalde API nodig.</p><h2>Top click opportunities — verified non-brand queries</h2><p>Priorities are based on impressions, position and low clicks. Ranking and CTR changes are not predicted results. Select a row, compare real search results, then improve the existing page.</p><table><thead><tr><th>Query / page</th><th>Impressions</th><th>Clicks</th><th>Position</th><th>Diagnosis and action</th></tr></thead><tbody>${g.query_opportunities.map(q=>`<tr><td><strong>${escapeHtml(q.query)}</strong><small><a href="${escapeHtml(q.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(q.url)}</a></small></td><td>${q.impressions.toLocaleString()}</td><td>${q.clicks}</td><td>${q.position}</td><td>${escapeHtml(q.type)}${q.case_study_locked?' · Case Study locked':''}<small>${escapeHtml(q.action)}</small><p><a href="/api/tracker-client/${encodeURIComponent(req.params.token)}/growth/brief?page_id=${encodeURIComponent(q.page_id)}&query=${encodeURIComponent(q.query)}" target="_blank" rel="noopener noreferrer">Open / copy execution brief</a></p>${q.case_study_locked?'':`<details><summary>Record actual publication</summary><form class="growth-log-form" data-page="${q.page_id}" data-query="${escapeHtml(q.query)}"><label>Publication date and time <input name="published_at" type="datetime-local" required></label><label>What actually changed? <textarea name="notes" required maxlength="3000" rows="3" placeholder="Describe verified changes and links actually published"></textarea></label><button type="submit">Save publication checkpoint</button><small role="status"></small></form></details>`}<details><summary>Action plan · 4 steps</summary><ol>${q.checklist.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol><p>${q.case_study_locked?'Case Study: research only; do not change this protected page during the measurement cycle.':'No automatic site edits. Review and publish changes deliberately.'}</p></details></td></tr>`).join('')}</tbody></table><h2>Prioritized page opportunities</h2><table><thead><tr><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th><th>Next step</th></tr></thead><tbody>${g.pages.map(row).join('')}</tbody></table><script>document.addEventListener('submit',async function(e){var f=e.target;if(!f.classList.contains('growth-log-form'))return;e.preventDefault();var b=f.querySelector('button'),out=f.querySelector('[role=status]');b.disabled=true;b.textContent='Saving…';out.textContent='';try{var x=await fetch('/api/tracker-client/'+encodeURIComponent(location.pathname.split('/')[2])+'/growth/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page_id:Number(f.dataset.page),query:f.dataset.query,notes:f.elements.notes.value,published_at:new Date(f.elements.published_at.value).toISOString()})});var r=await x.json();out.textContent=r.success?'Recorded. Awaiting comparable GSC measurements.':(r.error||'Not saved');}catch(err){out.textContent='Not saved. Check the date and connection.'}finally{b.disabled=false;b.textContent='Save publication checkpoint'}});</script></body></html>`);
 });
}
module.exports={registerGrowthCockpit,computeGrowth,bucket,buildGrowthClientBrief};
