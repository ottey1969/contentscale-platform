'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {URL:NativeURL}=require('node:url');
const code=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
class StubNode {
 constructor(tag){this.tagName=tag;this.children=[];this.handlers={};this.attrs={};this._text='';this.hidden=false;this.disabled=false;}
 appendChild(child){this.children.push(child);return child;}
 remove(){}
 click(){if(this.handlers.click)this.handlers.click();}
 addEventListener(evt,fn){this.handlers[evt]=fn;}
 getAttribute(name){return this.attrs[name]??null;}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text;}
}
const wait=()=>new Promise(resolve=>setImmediate(resolve));
async function check(owner){
 const requests=[],elements={};
 const main=new StubNode('main');
 main.attrs={'data-page-id':'7','data-owner-draft':owner?'true':'false'};
 for(const id of ['growthAutomaticReport','researchStatus','retryResearch','downloadResearch']){
  elements[id]=new StubNode('div');
 }
 const target='https://example.org/roof-guide/',base={
  success:true,url:'https://example.org/',page_id:7,case_study_locked:true,
  destination_gsc_evidence:{target_url:target,target_page_id:11},
  practical_growth_plan:{focus_query:'roof repair'},summary:{},
  growth_decision:{primary_next_action:{query:'roof repair'}},
  search_discovery:{},competitors:{},page_content:{},
  site_architecture:{},search:{},ai_visibility:{},
  editorial:{},findings:[]
 };
 const response=owner?{...base,access:{can_edit:true,owner_report:true},
  report_completion:{owner_only:true,status:'COMPLETE_FOR_OWNER_REVIEW'},
  editorial_review_draft:{status:'AI_DRAFT_REVIEW_REQUIRED',target_url:target,
   source_page_id:11,published:false,case_study_unchanged:true,
   draft:{sections:[{h2:'Owner-only improvement',paragraphs:['Write a useful, original and verifiable answer.']}]}}}:
  {...base,access:{can_edit:false,report_mode:'RESEARCH_ONLY'},
   report_completion:{status:'RESEARCH_ONLY_NO_EDITORIAL_DRAFT'},
   editorial_review_draft:{status:'RESEARCH_ONLY_OWNER_COMPLETION_NOT_RUN',auto_started:false,draft:null}};
 class URLShim extends NativeURL{}
 let downloadedBlob=null;
 URLShim.createObjectURL=blob=>{downloadedBlob=blob;return 'blob:test';};
 URLShim.revokeObjectURL=()=>{};
 const document={
  body:new StubNode('body'),
  querySelector:()=>main,
  getElementById:id=>elements[id]||null,
  createElement:tag=>new StubNode(tag)
 };
 const context={document,location:{pathname:'/track/secure-'+(owner?'owner':'readonly')+'/growth/auto-research'},
  URL:URLShim,Blob,encodeURIComponent,console,setTimeout:()=>{},
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async(url,opts)=>{
   requests.push({url,method:opts.method||'GET'});
   return {ok:true,json:async()=>response};
  }
 };
 vm.runInNewContext(code,context,{timeout:1500});
 await wait();await wait();await wait();
 assert.equal(requests.length,1,'Initial Growth page must make exactly one report request');
 assert.equal(requests[0].method,owner?'POST':'GET');
 assert.equal(requests[0].url.includes('/auto-research/complete?'),owner);
 assert.equal(elements.downloadResearch.hidden,false,'Finished report can be exported');
 assert.equal(elements.downloadResearch.disabled,false,'Download is not held after full report');
 assert.match(elements.researchStatus.textContent,owner?/Owner Growth report/:/Research-only report/);
 elements.downloadResearch.click();
 assert(downloadedBlob,'Export must create a JSON Blob from the displayed result');
 const exported=JSON.parse(await downloadedBlob.text());
 const latestDownload=document.body.children[document.body.children.length-1];
 assert.equal(latestDownload.download,owner?'contentscale-growth-complete-review.json':
  'contentscale-growth-research-only.json');
 if(owner){
  assert.equal(exported.report_completion.status,'COMPLETE_FOR_OWNER_REVIEW');
  assert.equal(exported.editorial_review_draft.status,'AI_DRAFT_REVIEW_REQUIRED');
  assert.equal(exported.editorial_review_draft.draft.sections[0].h2,'Owner-only improvement');
 }else{
  assert.equal(exported.editorial_review_draft.status,'RESEARCH_ONLY_OWNER_COMPLETION_NOT_RUN');
  assert.equal(exported.editorial_review_draft.draft,null);
 }
 const allText=function traverse(n){return [n.textContent,...n.children.map(traverse)].join(' ');};
 if(owner)assert.match(allText(elements.growthAutomaticReport),/Owner-only improvement/);
}
(async()=>{
 await check(true);await check(false);
 console.log('PASS Growth owner loads complete server JSON in one POST, read-only gets GET, no duplicate AI or premature export');
})().catch(e=>{console.error(e);process.exitCode=1});
