'use strict';
// Owner case 2026-11-21 (SYNTHETIC pages modelled on it): "Wat kost het om een specialist in te huren voor AI-zichtbaarheid
// en GEO?" checked on /ai-zichtbaarheid/, which has no price. The site's GEO service page already states "vanaf €297".
// The brief must name that page as the best match and point the price items to it, not advise prices on the checked page.
// Also: loose CTA lines, a rival's brand line and paragraphs from single competitor pages are no content advice.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {findBestOwnPage,isPriceQuestion}=require('../src/growth-free/best-own-page.cjs');
const {buildContentPriorities}=require('../src/growth-free/content-priorities.cjs');
const {ROWS,table}=require('../src/growth-free/ui-texts.cjs');

const Q='Wat kost het om een specialist in te huren voor AI-zichtbaarheid en GEO?';
const OWN='https://nl.contentscale.site/ai-zichtbaarheid/';
const GEO='https://nl.contentscale.site/generative-engine-optimization-geo/';
const AIO='https://nl.contentscale.site/ai-overview-optimalisatie/';
const body=(t)=>'<html><body><nav><a href="/">Home</a></nav><main>'+t+'</main></body></html>';
const pages={
 [OWN]:body('<h1>AI-zichtbaarheid</h1><p>Zo word je zichtbaar in ChatGPT en Google AI Overviews. Lees ook over <a href="/generative-engine-optimization-geo/">GEO-specialist inhuren</a>, '+
  '<a href="/ai-overview-optimalisatie/">AI Overview optimalisatie</a>, <a href="/contact/">contact</a>, <a href="https://es.contentscale.site/geo/">GEO (ES)</a> en <a href="/ai-zichtbaarheid/#top">top</a>.</p>'),
 [GEO]:body('<h1>GEO-specialist</h1><h2>Mijn tarief</h2><p>Mijn tarief: vanaf €297 per maand, maandelijks opzegbaar.</p>'),
 [AIO]:body('<h1>AI Overview optimalisatie</h1><p>Een audit kost € 450 eenmalig.</p>'),
 'https://nl.contentscale.site/contact/':body('<h1>Contact</h1><p>Mail of WhatsApp.</p>')};
const fetchHtml=async u=>{if(!pages[u])throw Error('not found');return {html:pages[u]}};

test('price question: the own page that already states the price is the best match (rare subject word wins)',async()=>{
 assert.equal(isPriceQuestion(Q),true);
 const r=await findBestOwnPage({pageUrl:OWN,query:Q,fetchHtml});
 assert.equal(r.status,'FOUND');assert.equal(r.url,GEO);assert.match(r.excerpt,/vanaf €297/);
 assert.ok(!r.checked.some(u=>/es\.contentscale|#/.test(u)),'another market and the page itself are never read');
});
test('no price question, or a price on the checked page itself: nothing is moved',async()=>{
 assert.equal((await findBestOwnPage({pageUrl:OWN,query:'Wat is AI-zichtbaarheid?',fetchHtml})).status,'NOT_A_PRICE_QUESTION');
 const withPrice=body('<h1>AI-zichtbaarheid</h1><p>Vanaf €297 per maand.</p><a href="/generative-engine-optimization-geo/">GEO</a>');
 assert.equal((await findBestOwnPage({pageUrl:OWN,query:Q,ownHtml:withPrice,fetchHtml})).status,'THIS_PAGE_HAS_PRICE');
 const noLinks=body('<h1>AI-zichtbaarheid</h1><p>Geen prijs hier.</p>');
 assert.equal((await findBestOwnPage({pageUrl:OWN,query:Q,ownHtml:noLinks,fetchHtml})).status,'NOT_FOUND');
});

const topic=(id,title,site,extra={})=>({id,group:'MISSING',title,coverage:'MISSING',priority:{sources:1},examples:[{site,heading:title,url:'https://'+site+'/geo-specialist/'}],...extra});
const summary={query:Q,decision:'IMPROVE_EXISTING',gaps:{items:[
 topic('1','Wat kost een GEO-specialist?','searchlab.nl',{priority:{sources:2},examples:[{site:'searchlab.nl',heading:'Wat kost een GEO-specialist?'},{site:'estrelle.nl',heading:'Prijzen GEO'}]}),
 topic('2','Werkt GEO echt, of is het hype?','www.estrelle.nl'),
 topic('3','Jouw coo mpagnon in het GEO landschap','coodigital.nl'),
 topic('4','Ontvang je eerste maandplan, volledig uitgewerkt in je mail.','www.marketingcollega.nl'),
 topic('5','Zo ziet je maandplan eruit. Bekijk voorbeeld','www.marketingcollega.nl'),
 topic('6','Voor veel bedrijven is een AI-antwoordhub de beste manier om te optimaliseren voor GEO. Zo’n hub is een centrale kennisstructuur, rondom één belangrijk thema. M','wessels-teksten.nl'),
 topic('7','Weet jij hoe zichtbaar je bent in Google en AI?','www.timmermansmedia.nl'),
 topic('8','Zo werken wij','www.customerimpact.be'),
 topic('9','De korte samenvatting','www.customerimpact.be')]}};
const aiGap={pages:[{site:'citedmetrics.com',url:'https://citedmetrics.com/p',cited_by:['ChatGPT']}],missing_topics:[],
 missing_facts:[{key:'price',label:'A price or price range',sites:['citedmetrics.com'],example:{site:'citedmetrics.com',excerpt:'$500 per month'}}]};

test('brief: the best own page leads, and price items point to it instead of asking for a price here',async()=>{
 const best=await findBestOwnPage({pageUrl:OWN,query:Q,fetchHtml});
 const cp=buildContentPriorities({summary,aiGap,bestOwnPage:best});
 assert.equal(cp.best_own_page.url,GEO);
 assert.match(cp.best_own_page.line,/^Best match on your site for this question: https:\/\/nl\.contentscale\.site\/generative-engine-optimization-geo\/ \(it already states your price\)/);
 const fact=cp.items.find(x=>x.id==='fact-price'),topicPrice=cp.items.find(x=>x.id==='1');
 for(const x of [fact,topicPrice]){assert.equal(x.action,'LINK_OWN_PRICE',x.title);assert.ok(x.instruction.includes(GEO));
  assert.match(x.instruction,/add one short line that links to it/);assert.doesNotMatch(x.instruction,/Add your own|Only if this is true/)}
 // Without a best match nothing changes.
 const plain=buildContentPriorities({summary,aiGap});
 assert.equal(plain.best_own_page,null);assert.equal(plain.items.find(x=>x.id==='fact-price').action,'ADD_OWN_FACT');
});
test('brief: CTA lines, a rival brand line, paragraphs and generic headings are observations, not advice',()=>{
 const cp=buildContentPriorities({summary,aiGap:null});
 const titles=cp.items.map(x=>x.title);
 assert.ok(titles.includes('Werkt GEO echt, of is het hype?'),'a real question stays advice');
 assert.ok(titles.includes('Wat kost een GEO-specialist?'));
 for(const id of ['3','4','5','6','7','8','9']){const t=summary.gaps.items.find(x=>x.id===id).title;
  assert.ok(!titles.includes(t),'not advice: '+t);assert.ok(cp.observations.some(o=>o.title===t&&o.reason),'kept as observation: '+t)}
});
test('result page and brief show the best match, in EN/NL/ES',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 assert.match(ui,/d\.content_priorities\.best_own_page\.line/,'the brief opens with the best own page');
 assert.match(ui,/id="bestOwnPage"/);assert.match(ui,/Research observations, not content advice/);
 assert.match(ui,/LINK_OWN_PRICE:'Link to your price page'/);
 for(const k of ['Best match on your site for this question','Your price page: {u}','Answer {q} there, not on this page.','On this page, add one short line that links to it.','Link to your price page','Research observations, not content advice ({n})']){
  const row=ROWS.find(r=>r[0]===k);assert.ok(row,k);assert.ok(row[1]&&row[2],k)}
 // The browser sees the URL as {u}: the brief line translates.
 const nl=table().nl;assert.ok(nl['Best match on your site for this question: {u} (it already states your price). Answer the price there; on this page, add one short line that links to it.']);
});
test('price now on the checked page itself (after an edit): price items say so and drop below open work',()=>{
 const now={status:'THIS_PAGE_HAS_PRICE',excerpt:'Mijn tarief begint vanaf €297 en is maandelijks opzegbaar.'};
 const cp=buildContentPriorities({summary,aiGap,bestOwnPage:now});
 const priceItems=cp.items.filter(x=>x.id==='fact-price'||x.id==='1');
 assert.equal(priceItems.length,2);
 for(const x of priceItems){assert.equal(x.action,'PRICE_ON_PAGE',x.title);assert.match(x.instruction,/Your page now states a price/);assert.match(x.instruction,/vanaf €297/);
  assert.doesNotMatch(x.instruction,/Add a section|Add your own/)}
 const open=cp.items.filter(x=>x.action!=='PRICE_ON_PAGE');
 assert.ok(open.length&&Math.max(...priceItems.map(x=>x.rank))>Math.max(...open.map(x=>x.rank)),'checked items come after open work');
 assert.equal(cp.best_own_page,null);
 const row=ROWS.find(r=>r[0]==='Already on your page — check');assert.ok(row&&row[1]&&row[2]);
});
test('guide page that now mentions the price still points to the service page for a hire question (owner 2026-11-21)',async()=>{
 const guide=body('<h1>AI-zichtbaarheid</h1><p>Mijn tarief begint vanaf €297. Details bij <a href="/generative-engine-optimization-geo/#tarief">mijn tarief op de GEO-pagina</a> en <a href="/ai-overview-optimalisatie/">AI Overview</a>.</p>');
 const r=await findBestOwnPage({pageUrl:OWN,query:Q,ownHtml:guide,fetchHtml});
 assert.equal(r.status,'FOUND');assert.equal(r.url,GEO);assert.equal(r.also_on_this_page,true);
 // The service page itself, checked with the same question, keeps its own price.
 const service=body('<h1>GEO-specialist inhuren</h1><p>Mijn tarief: vanaf €297.</p><a href="/ai-zichtbaarheid/">gids</a>');
 assert.equal((await findBestOwnPage({pageUrl:GEO,query:Q,ownHtml:service,fetchHtml})).status,'THIS_PAGE_HAS_PRICE');
});
test('hire topics point to the service page; one-site topics not compared with the page are observations',async()=>{
 const s2={...summary,gaps:{items:[...summary.gaps.items,
  topic('10','Hoe kies je de juiste GEO-specialist en waar let je op','www.estrelle.nl',{priority:{sources:3},recommended:true,examples:[{site:'www.estrelle.nl',heading:'Hoe kies je een GEO-specialist?'},{site:'customerimpact.be',heading:'Waar let je op'}]}),
  topic('11','Zelf GEO uitvoeren versus uitbesteden aan een specialist','timmermansmedia.nl',{priority:{sources:2}}),
  topic('12','GEO is geen trucje (helaas)','wessels-teksten.nl',{coverage:'UNKNOWN'}),
  topic('13','Hoe meet je AI-citaties per maand?','a.example',{priority:{sources:2}})]}};
 const best=await findBestOwnPage({pageUrl:OWN,query:Q,fetchHtml});
 const cp=buildContentPriorities({summary:s2,aiGap:null,bestOwnPage:best});
 for(const id of ['10','11']){const x=cp.items.find(i=>i.id===id);assert.equal(x.action,'ON_SERVICE_PAGE',x.title);assert.ok(x.instruction.includes(GEO));assert.match(x.instruction,/not on this page/)}
 assert.equal(cp.items.find(i=>i.id==='13').action,'ADD','a topic for this page stays');
 const last=cp.items.filter(i=>i.action==='ON_SERVICE_PAGE').map(i=>i.rank),open=cp.items.filter(i=>!['ON_SERVICE_PAGE','LINK_OWN_PRICE','PRICE_ON_PAGE'].includes(i.action)).map(i=>i.rank);
 assert.ok(Math.min(...last)>Math.max(...open),'work for another page comes after work for this page');
 assert.ok(!cp.items.some(i=>i.id==='12'));assert.ok(cp.observations.some(o=>o.title==='GEO is geen trucje (helaas)'&&/not compared/.test(o.reason)));
 assert.ok(ROWS.find(r=>r[0]==='Belongs on your service page'));
});
test('no shorten advice when the question belongs on another own page',async()=>{
 const report={competitor_overview:{status:'OBSERVED',ranking_pages:[],topics:[],this_page_sections:[{heading:'Intro',words:50},{heading:'📊 GSC-import',words:21},{heading:'Pijler 1 — Entiteitsopbouw',words:33}]}};
 const plain=buildContentPriorities({summary,aiGap:null,report});
 assert.ok(plain.trim.length>=1,'normally shown');
 const best=await findBestOwnPage({pageUrl:OWN,query:Q,fetchHtml});
 const cp=buildContentPriorities({summary,aiGap:null,report,bestOwnPage:best});
 assert.deepEqual(cp.trim,[]);assert.match(cp.trim_note,/belongs on/);
 assert.ok(ROWS.find(r=>r[0]==='Nothing is advised to shorten: this page was not checked against its own question. This search question belongs on {u}'));
});
test('real data: "not compared" is NOT_COMPARED; done work on the guide and on the service page is marked done',async()=>{
 const P=(t)=>'<p>'+t+' '+'Dit is extra uitleg zodat de sectie lang genoeg is om als inhoud te tellen voor de vergelijking van onderwerpen op de pagina.'+'</p>';
 const service=body('<h1>GEO-specialist</h1><h2>Zelf doen, een bureau of een consultant?</h2>'+P('Je kunt GEO zelf oppakken, uitbesteden aan een bureau of met een onafhankelijke consultant werken.')+
  '<h2>Hoe kies je de juiste GEO-specialist?</h2>'+P('Stel deze vijf vragen voordat je iemand inhuurt.')+'<h2>Mijn tarief</h2>'+P('Mijn tarief: vanaf €297 per maand, maandelijks opzegbaar.'));
 const fetch2=async u=>u===GEO?{html:service}:fetchHtml(u);
 const guide=body('<h1>AI-zichtbaarheid</h1><p>Mijn tarief begint vanaf €297. Details bij <a href="/generative-engine-optimization-geo/#tarief">mijn tarief op de GEO-pagina</a>.</p>');
 const best=await findBestOwnPage({pageUrl:OWN,query:Q,ownHtml:guide,fetchHtml:fetch2});
 assert.equal(best.status,'FOUND');assert.ok(best.service_sections.some(s=>/Hoe kies je/.test(s.heading)));
 const s3={...summary,gaps:{items:[
  topic('a','Kosten en tarieven voor het inhuren of uitbesteden van een GEO-specialist','estrelle.nl',{priority:{sources:4},recommended:true,examples:[{site:'estrelle.nl',heading:'Wat kost'},{site:'b.nl',heading:'Prijzen'}]}),
  topic('b','Hoe kies je de juiste GEO-specialist en waar let je op','estrelle.nl',{priority:{sources:3}}),
  topic('c','Zelf GEO uitvoeren versus uitbesteden aan een specialist','timmermansmedia.nl',{priority:{sources:2}}),
  topic('d','Praktijkvoorbeelden en klantbeoordelingen van GEO-trajecten','estrelle.nl',{priority:{sources:2}}),
  topic('e','GEO is geen trucje (helaas)','wessels-teksten.nl',{coverage:'NOT_COMPARED'})]}};
 const cp=buildContentPriorities({summary:s3,aiGap,bestOwnPage:best});
 const by=id=>cp.items.find(x=>x.id===id);
 for(const id of ['a','fact-price']){assert.equal(by(id).action,'PRICE_LINKED',id);assert.equal(by(id).needs_business_fact,false);assert.match(by(id).instruction,/already/)}
 for(const id of ['b','c']){assert.equal(by(id).action,'ON_SERVICE_PAGE_DONE',id);assert.match(by(id).instruction,/Already on your service page/)}
 assert.match(by('b').instruction,/Hoe kies je de juiste GEO-specialist\?/);
 assert.equal(by('d').action,'ON_SERVICE_PAGE','not on the service page yet: still open');
 assert.ok(!by('e')&&cp.observations.some(o=>o.title==='GEO is geen trucje (helaas)'),'NOT_COMPARED one-site topic is an observation');
 const rank=id=>by(id).rank;assert.ok(rank('d')<rank('b')&&rank('d')<rank('a'),'open work first, done work last');
 for(const k of ['Done — already on your service page','Done — price named and linked'])assert.ok(ROWS.find(r=>r[0]===k),k);
});
