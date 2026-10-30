'use strict';
// Owner package of page 2324 (international seo, 2026-10-30): the topic grouping failed in production
// ("not grouped invalid answer"). The model had to copy all 59 ranking-page headings (host + exact text) back into a
// 4000-token answer. Now sections are numbered (c1…, p1…), the answer lists ids only and gets more room, and a cut-off
// answer is reported as too long instead of being parsed.
// Real data: the 59 section headings of moz.com, semrush.com and phrase.com and the page section named in the package.
// The model answers below are hand-written MODEL_ANSWERs: they test validation and mapping, not the model's judgement.
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTopics,buildCompetitorOverview}=require('../src/growth-competitor-overview.cjs');
const {geminiModel}=require('../src/growth-task-meaning.cjs');
const real=require('./fixtures/growth-page-2324-2026-10-30/sections.json');
const competitors=real.ranking_pages.map(p=>({host:p.host,url:p.url,serp_position:p.serp_position,sections:p.headings.map(h=>({heading:h,excerpt:''}))}));
const page=[{heading:real.page_section_example}];
const idOf=(host,heading)=>{let n=0;for(const c of competitors)for(const s of c.sections){n++;if(c.host===host&&s.heading===heading)return 'c'+n}};

test('ids instead of copied headings: the three "measure performance" sections become one topic, the page section by id',()=>{
 const measure=[['moz.com','Measuring and analyzing international SEO performance'],['semrush.com','How to Track Your International SEO Performance'],['phrase.com','How to measure your international SEO performance']];
 const answer={topics:[{topic:'Measuring international SEO performance',sections:measure.map(([h,x])=>idOf(h,x)),page_covers:'NO',page_section:null},
  {topic:'What international SEO is',sections:[idOf('moz.com','What is international SEO?'),idOf('semrush.com','What Is International SEO?'),idOf('phrase.com','What is international SEO?')],page_covers:'YES',page_section:'p1'},
  {topic:'Invented',sections:['c999'],page_covers:'NO',page_section:null}]};
 const v=validateTopics(JSON.stringify(answer),competitors,page);
 const m=v.topics.find(t=>t.topic==='Measuring international SEO performance');
 assert.deepEqual(m.sections.map(s=>s.host),['moz.com','semrush.com','phrase.com']);assert.equal(m.ranking_pages,3);
 assert.equal(v.topics.find(t=>t.this_page==='YES').this_page_heading,real.page_section_example);
 assert(!v.topics.some(t=>t.topic==='Invented'),'an unknown id is dropped');
 assert.equal(v.ungrouped_sections.length,59-6,'nothing a ranking page covers disappears');
});

test('a cut-off model answer is reported as too long, not parsed; the full section list stays available',async()=>{
 const html=p=>'<html><body><article><h1>x</h1>'+p.headings.map(h=>'<h2>'+h+'</h2><p>'+'International SEO explained for this section with enough words to be read as content. '.repeat(3)+'</p>').join('')+'</article></body></html>';
 const pages=real.ranking_pages.map(p=>({url:p.url,html:html(p),serp_position:p.serp_position}));
 const ov=await buildCompetitorOverview({query:real.focus_query,ownHtml:'<h1>International SEO</h1><h2>'+real.page_section_example+'</h2><p>'+'Text about markets. '.repeat(20)+'</p>',competitors:pages,
  model:{call:async(prompt,opts)=>{assert.equal(opts.maxOutputTokens,8192);assert.match(prompt,/Refer to sections ONLY by these ids/);assert.match(prompt,/"id":"c59"/);
   throw Object.assign(Error('cut'),{code:'ANSWER_TRUNCATED'})}}});
 assert.equal(ov.topics_status,'NOT_GROUPED_ANSWER_TOO_LONG');
 assert(ov.ungrouped_sections.length>=50,'every section is still listed for the owner');
});

test('the Gemini client treats finishReason MAX_TOKENS as a cut-off answer',async()=>{
 const m=geminiModel({apiKey:'test-key',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"topics":[{"topic":"x","sec'}]}}]})})});
 await assert.rejects(m.call('p'),/ANSWER_TRUNCATED/);
 const ok=geminiModel({apiKey:'test-key',fetchImpl:async(u,o)=>{assert.equal(JSON.parse(o.body).generationConfig.maxOutputTokens,8192);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]})}}});
 assert.equal(await ok.call('p',{maxOutputTokens:8192}),'{}');
});

test('the owner package says where the research searched and names the site of each result left out',()=>{
 const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
 // LABELLED SYNTHETIC coverage numbers; the market setting is the one the owner set for page 2324.
 const pkg=buildOwnerHandoffPackage({decision:{focus_query:real.focus_query},report:{search_discovery:{
  search_locale:{country:'NL',hl:'en',source:'SET_IN_TRACKER',language_source:'SET_IN_TRACKER'},
  market_coverage:{markets:[{name:'Netherlands',researched:true,provider:'SERPER_GOOGLE_ORGANIC',usable_results:5},{name:'United Kingdom',researched:true,provider:'SERPER_GOOGLE_ORGANIC',usable_results:4},{name:'Belgium',researched:false},{name:'Luxembourg',researched:false}],
   note:'Researched: Netherlands, United Kingdom. Not researched: Belgium, Luxembourg. This is partial market research.'},
  rejected_leads:[{title:'International SEO Full Course: Rank Globally with Multilingual ...',url:'https://www.youtube.com/watch?v=abc',reason:'SEARCH_OR_SOCIAL_INFRASTRUCTURE'}]}}});
 const md=pkg.markdown;
 assert.match(md,/## Search market\n\n- Market: NL — set in Growth\n- Language: en — set in Growth/);
 assert.match(md,/- Belgium: not researched/);assert.match(md,/This is partial market research/);
 assert.match(md,/International SEO Full Course: Rank Globally with Multilingual \.\.\. \(youtube\.com\) — SEARCH_OR_SOCIAL_INFRASTRUCTURE/);
});
