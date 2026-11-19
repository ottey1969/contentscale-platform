'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build,sourceUrls}=require('../public/growth-complete-ai-brief.js');
const ui=fs.readFileSync(path.join(__dirname,'../public/growth-automatic-report-ui.js'),'utf8');
const route=fs.readFileSync(path.join(__dirname,'../src/tracker-growth-automatic-routes.cjs'),'utf8');
const q='Who offers 24-hour emergency roof repair in New Jersey?';
function fixture(){
 return {
  url:'https://example.com/24-hour-emergency-roof-repair-nj/',
  saved_at:'2026-11-17T02:00:00Z',
  search_discovery:{target_query:q,status:'SUCCESS',source:'SERPER_GOOGLE_ORGANIC',
   search_locale:{country:'us',hl:'en'},
   leads:[{url:'https://competitor-one.example/roof-emergencies'}],
   competitor_fetch_log:[{url:'https://competitor-one.example/roof-emergencies',outcome:'READABLE',serp_position:2}],
   people_also_ask:[{question:'What should I do if my roof leaks during a storm?'}]},
  page_content:{headings:{h1:['Emergency Roof Repair New Jersey'],h2:['What to do during a leak']},signals:{available:true}},
  gap_list:{status:'OBSERVED',focus_query:q,writing_allowed:true,
   evidence:{status:'ENOUGH_EVIDENCE',readable_ranking_pages:2},
   ranking_pages:[{url:'https://competitor-one.example/roof-emergencies',position:2}],
   unique_content:[{heading:'Local emergency contact procedure'}],
   items:[{id:'topic-1',title:'Temporary weather protection',coverage:'MISSING',writable:true,
    recommended:true,reader_question:'What can be done immediately?',
    placement:{section_heading:'What to do during a leak'},
    priority:{sources:2,suggested_action:'Add a step after emergency instructions'},
    examples:[{url:'https://competitor-one.example/roof-emergencies',heading:'Protecting the building',excerpt:'Temporary coverings protect the exposed area.'}]}]},
  ai_check:{search_term:q,summary:{checked:5,engines:[
   {id:'chatgpt',label:'ChatGPT Search',checked:true,verifiable:true,own_site_cited:false},
   {id:'gemini',label:'Gemini',checked:true,verifiable:false}]},
   prewrite_reuse:{status:'MATCHED',items:[{engine:'claude',status:'EDITORIAL_ONLY'}]},
   gap:{status:'READ',topics_basis:'TOPICS_COMPARED',pages:[{site:'competitor-one.example',url:'https://competitor-one.example/roof-emergencies',read:true,cited_by:['chatgpt']}],
    missing_topics:[{topic:'Emergency storm damage assessment',coverage:'MISSING',
     sites:['competitor-one.example'],examples:[{site:'competitor-one.example',heading:'Storm damage'}]}],
    missing_facts:[{key:'licence',label:'A licence or registration number',sites:['competitor-one.example']}]}},
  practical_growth_plan:{change:{summary:'Add emergency safety details'},competitors:{
   side_by_side:[{competitor_url:'https://competitor-one.example/roof-emergencies',competitor_excerpt:'Cover the roof temporarily',tracked_page_section:'What to do during a leak',editorial_action:'Review the emergency response steps'}]}},
  editorial_decision_gate:{focus_query:q,decision:'IMPROVE_EXISTING'},
  evidence_warnings:['Original insurance terms require verification']
 };
}
test('complete Growth brief covers full Pre-Write-grade work package with exact query and original page',()=>{
 const output=build(fixture());
 assert.match(output,/COMPLETE EXTERNAL AI RESEARCH & WRITING BRIEF/);
 assert.match(output,new RegExp(q.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
 assert.match(output,/24-hour-emergency-roof-repair-nj/);
 for(const part of ['WHAT IS ALREADY ON THE PAGE','EVIDENCE QUALITY','RANKING COMPETITOR SOURCE LEADS',
  'GOOGLE RANKING-PAGE CONTENT GAPS','AI-ANSWER COVERAGE','AI-CITED CONTENT TOPICS',
  'PEOPLE ALSO ASK','ENTITY STRATEGY','EXPERT QUOTES','INTERNAL LINKING','ARTICLE STRUCTURE',
  'QUALITY GATE','RESEARCH SNAPSHOT','FINAL OUTPUT FORMAT','CMS-ready HTML','source-to-claim'])
  assert.ok(output.includes(part),'Missing section '+part);
 assert.match(output,/Emergency storm damage assessment/);
 assert.match(output,/https:\/\/competitor-one.example\/roof-emergencies/);
 assert.match(output,/Existing page URL: https:\/\/example.com/);
 assert.match(output,/Existing page sections must be re-opened/);
 assert.match(output,/Original insurance terms require verification/);
 assert.match(output,/NOT VERIFIED/);
});
test('missing evidence is labelled, never invented or claimed measured',()=>{
 const output=build({url:'https://example.com/',ai_check:{search_term:q,gap:{missing_topics:[
  {topic:'Documentation after tarping',sites:['roof.example'],coverage:'UNSURE'}]}}});
 assert.match(output,/NOT AVAILABLE IN SAVED RESEARCH/);
 assert.match(output,/source leads/i);
 assert.match(output,/Documentation after tarping/);
 assert.match(output,/Do not infer cities, counties, licensing, service capability or business credentials/);
 assert.match(output,/UNVERIFIED/);
 assert.doesNotMatch(output,/our licensed crews are dispatched within 30 minutes/i);
});
test('all stored competitor excerpts preserved in appendix without silent character truncation',()=>{
 const item=fixture(),text='D'.repeat(1000);
 item.gap_list.items[0].examples[0].excerpt=text;
 const output=build(item);
 assert.ok(output.includes(text),'Full saved evidence should appear in the appendix');
});
test('source link leads use actual HTTPS URLs and reject invented or malformed addresses',()=>{
 assert.deepEqual(sourceUrls(['https://example.com/a','http://example.com/a','example.com/b','https://example.com/a','https://user:pass@example.com/hidden']),['https://example.com/a']);
});
test('browser loads complete builder and uses same full content for copy and downloadable Markdown',()=>{
 assert.match(route,/growth-complete-ai-brief\.js\?v=/);
 assert.match(ui,/window\.GrowthCompleteAiBrief\.build\(d/);
 assert.match(ui,/Copy FULL AI research \+ writing brief/);
 assert.match(ui,/Download full AI brief \(\.md\)/);
 assert.match(ui,/function completeBrief\(\)\{return externalAiContentBrief\(d,topics\)\}/);
 assert.match(ui,/no partial prompt was copied/);
 assert.match(ui,/no partial file was generated/);
});

test('complete research brief remains available with zero AI topic gaps',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../public/growth-automatic-report-ui.js'),'utf8');
 assert.match(ui,/No AI-cited content gaps were identified or verified/);
 assert.doesNotMatch(ui,/box\.hidden=!topics\.length;if\(!topics\.length\)return/);
 const output=build({...fixture(),ai_check:{search_term:q,gap:{missing_topics:[]}}});
 assert.match(output,/GOOGLE RANKING-PAGE CONTENT GAPS/);
 assert.match(output,/NO_CHANGE is a legitimate result/);
});

test('Growth brief preserves complete, partial, missing and unknown content without Gemini gap filtering',()=>{
 const d=fixture();
 d.gap_list.items.push(
  {id:'present',title:'Existing roof leak guidance',coverage:'COMPLETE',examples:[{url:'https://competitor-one.example/roof-emergencies',excerpt:'Useful additional nuance'}]},
  {id:'partial',title:'Temporary protection steps',coverage:'PARTIAL',examples:[{url:'https://competitor-one.example/roof-emergencies',excerpt:'Practical instructions'}]},
  {id:'unknown',title:'Insurance documentation',coverage:'UNSURE'});
 const output=build(d);
 for(const text of ['COMPLETE CONTENT COVERAGE INVENTORY','Existing roof leak guidance','Temporary protection steps',
  'Insurance documentation','COVERAGE COMPLETE','COVERAGE PARTIAL','COVERAGE MISSING','COVERAGE UNKNOWN','Useful additional nuance'])
  assert.ok(output.includes(text),'Missing useful content: '+text);
});
test('unreadable own page never produces false complete or missing coverage',()=>{
 const d=fixture();d.page_content.signals.available=false;
 const output=build(d);
 assert.ok(output.includes('Temporary weather protection | COVERAGE UNKNOWN'));
 assert.match(output,/Existing page sections must be re-opened/);
});
test('AI observations and Google findings remain together even when no new gaps are accepted',()=>{
 const d=fixture();
 d.gap_list.items=[];
 d.ai_check.gap.missing_topics=[{topic:'Detailed safety preparation',coverage:'PARTIAL',examples:[{site:'roof.example',excerpt:'Useful procedures'}]}];
 const output=build(d);
 assert.ok(output.includes('Detailed safety preparation | COVERAGE PARTIAL'));
 assert.match(output,/Useful procedures/);
 assert.match(output,/RANKING COMPETITOR SOURCE LEADS/);
});

test('complete brief is rendered even without a separate topic-picker',()=>{
 assert.match(ui,/function renderAiContentTasks\(d,choice\)\{/);
 assert.doesNotMatch(ui,/function renderAiContentTasks\(d,choice\)\{\s*if\(!choice\)return/);
 // Rendered unconditionally, before the topic-picker check (#489 wraps the AI observations in between).
 assert.match(ui,/\n  renderAiContentTasks\(d,choice\);\n[\s\S]{0,1500}?\n  if\(choice\)\{/);
 assert.doesNotMatch(ui,/if\(choice\)\{?\s*renderAiContentTasks\(d,choice\)/);
 assert.match(ui,/GROWTH RESEARCH REPORT/);
 assert.doesNotMatch(ui,/STEP '\+x\.stage\+' OF 3/);
});
test('research starts after setup inputs and saved reports do not trigger optional AI research',()=>{
 assert.match(ui,/optionalInputs\.insertAdjacentElement\('afterend',firstPanel\)/);
 assert.match(ui,/Run Growth Research/);
 assert.doesNotMatch(ui,/if\(main\.getAttribute\('data-owner-draft'\)==='true'\)triggerAutomaticAi\(saved\.report\)/);
});
