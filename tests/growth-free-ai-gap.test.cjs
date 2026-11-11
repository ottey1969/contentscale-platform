'use strict';
// AI gap: for the AI systems that do not cite the site, the pages they cite are read and compared with the page,
// like the Google gap. All pages and answers below are TEST fixtures.
const test=require('node:test'),assert=require('node:assert/strict');
const gap=require('../src/growth-free/ai-gap.cjs'),ai=require('../src/growth-free/ai-answers.cjs');
const para=t=>'<p>'+(t+' ').repeat(8)+'</p>';
const PAGE='https://acme-roofing.example/emergency-roof-repair/';
const OWN='<html><body><h1>Emergency roof repair</h1><h2>What qualifies as an emergency</h2>'+para('A leak during a storm is an emergency for the house.')+
 '<h2>Our licence</h2>'+para('Registered contractor HIC registration No. 13VH99999999 in the state.')+'</body></html>';
const CITED_A='https://roofer-a.example/emergency/',CITED_B='https://roofer-b.example/tarping/',CITED_C='https://roofer-c.example/x/';
const A='<html><body><h1>Emergency roofing</h1><h2>What counts as a roofing emergency</h2>'+para('Water coming through the ceiling during a storm counts.')+
 '<h2>Emergency roof repair cost</h2>'+para('Emergency repairs usually cost $300 to $1,500 depending on the damage found.')+
 '<h2>Arrival time after a call</h2>'+para('Arrival within 60 minutes is typical in most of the county after a call.')+
 '<script type="application/ld+json">{"@type":"FAQPage"}</script></body></html>';
const B='<html><body><h2>What we tarp</h2>'+para('Trees through the roof, wind-stripped shingles and torn membranes.')+
 '<h2>Emergency roof repair cost</h2>'+para('A tarp starts at $250 and the repair is quoted after the inspection.')+
 '<script type="application/ld+json">{"@type":"FAQPage"}</script></body></html>';
const pages={[PAGE]:OWN,[CITED_A]:A,[CITED_B]:B};
const fetchHtml=async u=>{if(!pages[u])throw Error('unreachable');return {html:pages[u]}};
const parsed=(srcs,own=false)=>({sources:srcs,source_sites:srcs.map(u=>new URL(u).hostname),own_site_cited:own,sources_verifiable:true});
const answers=[{engine:'chatgpt',parsed:parsed([CITED_A,CITED_B,CITED_C])},{engine:'perplexity',parsed:parsed([CITED_B])},
 {engine:'copilot',parsed:parsed([PAGE,'https://roofer-d.example/'],true)}];

test('only pages cited by AI systems that do not cite you are compared, most-cited first',()=>{
 const c=gap.citedPages(answers,PAGE);
 assert.deepEqual(c.map(x=>x.url),[CITED_B,CITED_A,CITED_C]);
 assert.ok(!c.some(x=>/roofer-d/.test(x.url)),'pages cited next to your own page are not a gap');
});

test('without a model: missing facts, topics by heading words, elements, unreadable pages named',async()=>{
 const g=await gap.buildAiGap({answers,pageUrl:PAGE,engines:ai.ENGINES,fetchHtml});
 assert.equal(g.status,'READ');assert.equal(g.topics_basis,'HEADING_WORDS');
 assert.deepEqual(g.pages.map(p=>[p.site,p.read]),[['roofer-b.example',true],['roofer-a.example',true],['roofer-c.example',false]]);
 assert.equal(g.pages.find(p=>p.site==='roofer-c.example').status,'Could not be opened');
 assert.deepEqual(g.pages[0].cited_by,['ChatGPT Search','Perplexity']);
 const facts=g.missing_facts.map(f=>f.key);
 assert.ok(facts.includes('price')&&facts.includes('response_time'));assert.ok(!facts.includes('licence'),'your page states its licence');
 assert.deepEqual(g.missing_facts.find(f=>f.key==='price').sites,['roofer-b.example','roofer-a.example']);
 const cost=g.missing_topics.find(t=>/cost/i.test(t.topic));assert.deepEqual(cost.sites.sort(),['roofer-a.example','roofer-b.example']);
 assert.ok(g.elements.structured_data_they_have_and_this_page_lacks.some(x=>x.type==='FAQPage'));
 assert.ok(!('html' in g.pages[0]),'page HTML is not sent to the browser');
});

test('with a model: topics compared by meaning, so a differently worded section on your page counts',async()=>{
 const model={call:async prompt=>{const ids=[...prompt.matchAll(/"id":"(c\d+)","heading":"([^"]+)"/g)].map(m=>({id:m[1],h:m[2]}));
  const pick=re=>ids.filter(x=>re.test(x.h)).map(x=>x.id);
  return JSON.stringify({topics:[{topic:'What counts as an emergency',sections:pick(/counts as/i),page_covers:'YES',page_section:'p1',fits_search:'YES'},
   {topic:'Emergency repair cost',sections:pick(/cost/i),page_covers:'NO',page_section:null,fits_search:'YES'},
   {topic:'Arrival time',sections:pick(/arrival/i),page_covers:'PARTLY',page_section:'p1',fits_search:'YES'},
   {topic:'What gets tarped',sections:pick(/tarp/i),page_covers:'NO',page_section:null,fits_search:'YES'}],
   pages:[{host:'roofer-a.example',same_subject:'YES'},{host:'roofer-b.example',same_subject:'YES'}]})}};
 const g=await gap.buildAiGap({answers,pageUrl:PAGE,query:'emergency roof repair',engines:ai.ENGINES,fetchHtml,model});
 assert.equal(g.topics_basis,'TOPICS_COMPARED');
 const t=g.missing_topics.map(x=>x.topic);
 assert.ok(t.includes('Emergency repair cost')&&t.includes('What gets tarped'));assert.ok(!t.includes('What counts as an emergency'));
 assert.equal(g.missing_topics.find(x=>x.topic==='Arrival time').coverage,'PARTLY');
 const a=g.pages.find(p=>p.site==='roofer-a.example');
 assert.equal(a.headings.find(h=>/counts as/i.test(h.text)).status,'ON_YOUR_PAGE');
});

test('nothing to compare when every AI system cites you, and no gap claims when your page cannot be read',async()=>{
 assert.equal((await gap.buildAiGap({answers:[answers[2]],pageUrl:PAGE,fetchHtml})).status,'NO_CITED_PAGES');
 const g=await gap.buildAiGap({answers,pageUrl:PAGE,fetchHtml:async u=>{if(u===PAGE)throw Error('down');return fetchHtml(u)}});
 assert.equal(g.status,'OWN_PAGE_UNREADABLE');assert.deepEqual(g.missing_facts,[]);
});

test('facts are detected in visible text only',()=>{
 const f=gap.factsOf('<script>var price="$500"</script><p>Call us any time.</p>');assert.deepEqual(f,{});
 assert.ok(gap.factsOf('<p>We arrive within 45 minutes.</p>').response_time);
 assert.ok(gap.factsOf('<ol><li>a</li><li>b</li><li>c</li></ol>').process);
});
