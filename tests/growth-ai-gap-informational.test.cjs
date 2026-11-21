'use strict';
// Owner 2026-11-21, Growth brief for nl.contentscale.site/wat-is-een-ai-overview/ ("Wat is AI overview?"): "State on your
// page: a price or price range … Example from dev.to: 'Domain Authority in 2026 ... OpenAI&#39;s $4 Billion Deployment
// Company'". The amount came from dev.to's navigation, "$4 Billion" is not a price, a "what is" question asks for no
// business facts, and the entity was not decoded. Also: the ChatGPT answer in Dutch used "How urgent is roof repair?" as its
// example, a sign of an earlier chat or memory; that is now pointed out.
const test=require('node:test'),assert=require('node:assert/strict');
const gap=require('../src/growth-free/ai-gap.cjs'),ai=require('../src/growth-free/ai-answers.cjs');
const research=require('../public/prewrite-ai-answer-research.js');

const PAGE='https://nl.contentscale.site/wat-is-een-ai-overview/';
const para=t=>'<p>'+(t+' ').repeat(8)+'</p>';
const OWN='<html><body><h1>Wat is een AI Overview?</h1><h2>De betekenis uitgelegd</h2>'+para('Een AI Overview is een samenvatting bovenaan Google.')+'</body></html>';
const DEV='https://dev.to/x/what-is-ai-overviews/';
const DEVHTML='<html><body><nav><a href="/a">Domain Authority in 2026</a> <a href="/b">OpenAI&#39;s $4 Billion Deployment Company: When the Model Builder Becomes</a></nav>'+
 '<main><h1>What is AI Overviews</h1><h2>How they work</h2>'+para('AI Overviews summarise several sources at the top of Google search results.')+
 '<h2>Funding</h2>'+para('The startup raised $4 billion and later another €2,5 miljard from investors.')+'</main><footer>Pricing $9 per month for pro members</footer></body></html>';
const SHOP='https://shop.example/roof-repair-cost/';
const SHOPHTML='<html><body><main><h1>Roof repair cost</h1><h2>Prices</h2>'+para('A small repair costs $300 to $1,500 depending on the damage.')+'</main></body></html>';
const pages={[PAGE]:OWN,[DEV]:DEVHTML,[SHOP]:SHOPHTML};
const fetchHtml=async u=>{if(!pages[u])throw Error('unreachable');return {html:pages[u]}};
const parsed=srcs=>({sources:srcs,source_sites:srcs.map(u=>new URL(u).hostname),own_site_cited:false,sources_verifiable:true});

test('a "what is" question asks for no business facts such as a price',async()=>{
 const g=await gap.buildAiGap({answers:[{engine:'claude',parsed:parsed([DEV,SHOP])}],pageUrl:PAGE,query:'Wat is AI overview?',engines:ai.ENGINES,fetchHtml});
 assert.ok(!g.missing_facts.some(f=>f.key==='price'),JSON.stringify(g.missing_facts));
});
test('a price is a price: not a navigation link, not a footer, not "$4 billion"; entities decoded',async()=>{
 const g=await gap.buildAiGap({answers:[{engine:'claude',parsed:parsed([DEV])}],pageUrl:PAGE,query:'ai overview kosten',engines:ai.ENGINES,fetchHtml});
 assert.ok(!g.missing_facts.some(f=>f.key==='price'),'dev.to states no price in its content: '+JSON.stringify(g.missing_facts));
 const s=await gap.buildAiGap({answers:[{engine:'claude',parsed:parsed([SHOP])}],pageUrl:PAGE,query:'roof repair cost',engines:ai.ENGINES,fetchHtml});
 const p=s.missing_facts.find(f=>f.key==='price');assert.ok(p,'a real price in the content still counts');
 assert.match(p.example.excerpt,/\$300 to \$1,500/);
 assert.doesNotMatch(JSON.stringify(g),/&#39;/);
});
const NL='Een AI Overview is een door kunstmatige intelligentie gegenereerd overzicht dat bovenaan de zoekresultaten van Google kan verschijnen. ';
test('an example search in another language than the answer is pointed out (earlier chat or memory); a normal example is not',()=>{
 const roof=research.validateAnswer(NL+'Wanneer iemand bijvoorbeeld zoekt naar *\'How urgent is roof repair?\'*, kan Google een AI Overview tonen met informatie over dakschade.','Wat is AI overview?');
 assert.equal(roof.valid,true,'it still counts');
 assert.ok(roof.warnings.includes('example_other_language'),JSON.stringify(roof));
 assert.match(roof.message,/How urgent is roof repair\?/);assert.match(roof.message,/new, empty/);
 const solar=research.validateAnswer(NL+'Kort voorbeeld: Zoekopdracht: “Wat zijn de voordelen en nadelen van zonnepanelen?” AI Overview: een korte samenvatting.','Wat is AI overview?');
 assert.ok(!solar.warnings.includes('example_other_language'),JSON.stringify(solar));
 const en=research.validateAnswer('An AI Overview is a summary at the top of Google. For example, when someone searches for "How urgent is roof repair?" Google may show one.','What is an AI overview?');
 assert.ok(!en.warnings.includes('example_other_language'),'same language: an ordinary example');
});
