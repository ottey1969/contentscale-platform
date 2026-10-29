'use strict';
// Production reports 38-41 (2026-10-29). Inputs: report 39's real Google titles (fixture), and SYNTHETIC pages for the
// report-40 situation (first pages read share no reader task while unread Google candidates remain).
const test=require('node:test'),assert=require('node:assert/strict');
const {sameWord,matchedTerms}=require('../src/growth-word-match.cjs');
const {parseSerperGoogleOrganic}=require('../src/growth-public-search-discovery.cjs');
const {classifyDestinationIntent}=require('../src/growth-reader-task-coverage.cjs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const serp39=require('./fixtures/growth-reports-38-41/report-39-serp-titles.json');

test('word forms: same word in another form matches, different words do not',()=>{
 for(const [a,b] of [['tracker','tracking'],['tracker','track'],['trackers','tracked'],['citation','citations'],['scale','scaling'],['roofer','roofing'],['editor','editing'],['services','service']])
  assert.ok(sameWord(a,b),a+' ~ '+b);
 for(const [a,b] of [['care','car'],['plan','planet'],['part','party'],['roof','proof'],['track','truck'],['news','new'],['cover','covet']])
  assert.ok(!sameWord(a,b),a+' != '+b);
 assert.deepEqual(matchedTerms(['citation','tracker'],['citation','tracking','tools']),['citation','tracker']);
});

test('report 39: Google titles about "AI citation tracking" are not dropped for the query "ai citation tracker"',()=>{
 const log=[];
 const leads=parseSerperGoogleOrganic({organic:serp39.organic},{query:serp39.query,ownUrl:serp39.own_url,limit:10,rejectedLog:log});
 assert.ok(serp39.organic.filter(x=>x.production_reason==='QUERY_TERMS_NOT_IN_TITLE').length>=10,'production dropped most results');
 assert.equal(log.filter(x=>x.reason==='QUERY_TERMS_NOT_IN_TITLE').length,0,'none is dropped for its word form now');
 assert.equal(leads.length,10);
 for(const t of ['WTF is AI citation tracking?','How to track (and grow) AI engine citations','AI Citation Checker: Track & Analyze AI Answer Sources'])
  assert.ok(leads.some(l=>l.title===t),t);
 // Other filters still apply: social/infrastructure and forum pages stay out.
 assert.ok(log.some(x=>x.reason==='SEARCH_OR_SOCIAL_INFRASTRUCTURE'));
 // A title that shares only one query word is still dropped.
 const other=parseSerperGoogleOrganic({organic:[{title:'Citation Machine: APA, MLA citation generator',link:'https://citations.example/apa'}]},{query:serp39.query,ownUrl:serp39.own_url,rejectedLog:log});
 assert.equal(other.length,0);
});

test('destination topic check uses the same word rule; a missing topic word is still missing',()=>{
 const d=classifyDestinationIntent({query:'ai citation tracker',title:'AI Citation Tracking: How to Measure Citations',url:'https://x.example/ai-citation-tracking/',serpIntent:'INFORMATIONAL_GUIDE'});
 assert.deepEqual(d.missing_query_roots,[]);assert.equal(d.verdict,'COMPATIBLE');
 const w=classifyDestinationIntent({query:'wind damage roof repair nj',title:'Roof Damage Repair NJ',url:'https://x.example/roof-damage-repair-nj/',serpIntent:'LOCAL_SERVICE'});
 assert.deepEqual(w.missing_query_roots,['wind'],'report 18 guard still holds');
});

// ---- Report 40: three pages read, no shared task, three Google candidates unread ----
const URL_='https://acme-roofing.example/roof-repair-lodi-nj/';
const ownHtml='<html><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title></head><body><h1>Roof Repair in Lodi, NJ</h1>'+
 '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p>'+
 '<h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(([a,b])=>'<h2>'+a+'</h2><p>'+b+'</p>').join('')+'</article></body></html>';
const estimateA='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, which is why each estimate should be itemised clearly.';
const estimateB='Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate makes that comparison easy.';
// Three readable pages, each about something different (no reader task taught by two sites).
const para=(topic,detail)=>'The '+topic+' needs attention every year, because '+detail+' A homeowner who checks the '+topic+' after each season avoids most of the problems described here, and a short written note of what was seen makes the next inspection of the '+topic+' quicker.';
const solo=[
 [['Gutter cleaning schedule',para('gutter','leaves and seeds collect in it every autumn and a clogged gutter overflows against the fascia boards.')],
  ['Downspout extensions',para('downspout','water that leaves the downspout too close to the wall soaks the soil next to the foundation.')],
  ['Gutter guards',para('gutter guard','mesh guards keep larger leaves out but still let fine seeds and pine needles collect underneath.')]],
 [['Skylight condensation',para('skylight','warm indoor air meets cold glass in winter and droplets form on the skylight frame.')],
  ['Skylight blinds',para('skylight blind','direct summer sun fades the fabric and heats the room below the skylight.')],
  ['Skylight seals',para('skylight seal','rubber seals around the glass harden with age and let draughts in around the frame.')]],
 [['Chimney flashing materials',para('chimney flashing','copper, aluminium and lead flashing age differently around a brick chimney.')],
  ['Chimney crown cracks',para('chimney crown','frost opens small cracks in the cement crown at the top of the chimney.')],
  ['Chimney caps',para('chimney cap','an open flue lets rain, birds and leaves fall straight into the chimney.')]]];
const pages={[URL_]:ownHtml,
 'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',solo[0]),
 'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ',solo[1]),
 'https://roofer-c.example/roof-repair-nj/':comp('Roof repair in Clifton, NJ',solo[2]),
 'https://roofer-d.example/roof-repair-nj/':comp('Roof repair in Hackensack, NJ',[['How a repair estimate is built',estimateA]]),
 'https://roofer-e.example/roof-repair-nj/':comp('Roof repair in Passaic, NJ',[['What goes into an estimate',estimateB]]),
 'https://roofer-f.example/roof-repair-nj/':comp('Roof repair in Garfield, NJ',solo[2])};
const towns=['Paterson','Bergen County','Clifton','Hackensack','Passaic','Garfield'];
const leads=Object.keys(pages).filter(u=>u!==URL_).map((url,i)=>({url,title:'Roof Repair in '+towns[i]+', NJ | Roofer '+'ABCDEF'[i],snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
function harness(leadList){
 const route={},fetched=[];
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{async query(sql){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql))throw Error('No writes permitted');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:77,tracker_client_id:4,url:URL_,keyword:'roof repair lodi nj',saved_html:ownHtml}]};
  return {rows:[]};
 }},(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:false,pages:[{id:77,url:URL_,keyword:'roof repair lodi nj',case_study_active:false}]};next()},{
  retryDelayMs:0,...require('./helpers/meaning-check-stand-in.cjs').meaningStandIn,
  fetchLive:async url=>{fetched.push(url);const html=pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
   return {html,final_url:url,retrieved_at:'2026-10-29T06:53:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async()=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:'roof repair lodi nj',leads:leadList,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-29T06:53:00Z'})});
 const call=async()=>{const req={params:{token:'t'},query:{page_id:'77'}},res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const stack=route['/api/tracker-client/:token/growth/auto-research'];
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res.body};
 return {call,fetched};
}

test('report 40: unread Google candidates are read before concluding "no shared reader task"',async()=>{
 const h=harness(leads),b=await h.call();
 const c=b.reader_task_coverage,g=b.editorial_decision_gate;
 assert.equal(c.extended_competitor_reading.reason,'NO_SHARED_TASK_IN_FIRST_PAGES_READ');
 assert.equal(c.extended_competitor_reading.extra_pages_tried,3);
 assert.ok(c.supported_task_codes.length>=1,'the estimate task is found on the extra pages');
 assert.notEqual(g.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
 assert.equal(g.decision,'IMPROVE_EXISTING');
 assert.equal(h.fetched.filter(u=>u!==URL_).length,6,'bounded: the six candidates Google returned, no new search');
 const fetchSrc=g.attempted_sources.find(a=>a.source==='COMPETITOR_HTML_FETCH');
 assert.match(fetchSrc.detail,/read 3 more because the first pages shared no reader task/);
 assert.equal(b.search_discovery.competitor_fetch_log.length,6);
});

test('report 40: with no unread candidates the honest blocker stays; with a shared task found early nothing extra is read',async()=>{
 const few=harness(leads.slice(0,3)),b=await few.call();
 assert.equal(b.editorial_decision_gate.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
 assert.equal(b.reader_task_coverage.extended_competitor_reading,undefined);
 const early=harness([leads[3],leads[4],leads[0],leads[1],leads[2],leads[5]]),e=await early.call();
 assert.equal(e.reader_task_coverage.extended_competitor_reading,undefined);
 assert.equal(early.fetched.filter(u=>u!==URL_).length,3,'nothing extra fetched');
});

// Report 43: Sussex County NJ must not compare to Sussex County DE.
test('R43: an explicit same-county NJ heading localizes research and rejects Delaware competitors',()=>{
 const {deriveMarket,rejectLead}=require('../src/growth-serp-quality.cjs');
 const query='sussex county roofing services',url='https://perfectroofingteam.com/sussex-county-roofing-services/';
 const market=deriveMarket({query,keyword:query,url,pageHeadings:['Common Roofing Problems in Sussex County, NJ']});
 assert.deepEqual(market.states,['NJ']);
 assert.equal(rejectLead({query,marketStates:market.states,lead:{url:'https://pjfitz.com/areas/delaware/roofing-contractors-in-sussex-county/',title:'Expert Roofing Contractors in Sussex County, DE'}}),'DIFFERENT_REGION:DE');
 assert.equal(rejectLead({query,marketStates:market.states,lead:{url:'https://nj.example/sussex-county-nj',title:'Sussex County, NJ Roofing Services'}}),null);
 const unknown=deriveMarket({query,keyword:query,url,pageHeadings:['Service areas across New Jersey','Sussex County roof repairs']});
 assert.equal(unknown,null,'a state mentioned without the same county is not enough');
});
