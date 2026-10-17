'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../public/tracker-growth-ui.js'),'utf8');
const measurement=fs.readFileSync(path.resolve(__dirname,'../src/tracker-growth-measurement.cjs'),'utf8');
assert(measurement.includes('defer src="/tracker-growth-ui.js"'),'Measurement must share Tracker locale asset');
const storage={cs_ui_language:'nl'},elements={},nodes=[];
function textNode(value,protectedData=false){
 const n={nodeValue:value,parentElement:{closest(){return protectedData?{}:null}}};nodes.push(n);return n;
}
const header=textNode('Measured click growth');
const research=textNode('Open research brief · no GSC required');
const status=textNode('CONTENT_RESEARCH');
const userData=textNode('Clicks',true); // e.g. an exact user query, never translate
const unknown=textNode('exact query from customer');
function el(tag){
 return {tag,children:[],style:{},events:{},textContent:'',appendChild(c){this.children.push(c);if(c.id)elements[c.id]=c},
  addEventListener(n,cb){this.events[n]=cb},setAttribute(){}};
}
const body={firstChild:null,insertBefore(e){elements[e.id]=e}};
const doc={
 readyState:'complete',body,documentElement:{lang:'en'},title:'Growth measurement',
 getElementById(id){return elements[id]||null},createElement:el,
 querySelector(){return null},querySelectorAll(){return []},
 createTreeWalker(){let i=0;return {nextNode(){return nodes[i++]||null}}}
};
vm.runInNewContext(code,{document:doc,location:{pathname:'/track/read-only-token/growth/measurement'},
 localStorage:{getItem(k){return storage[k]},setItem(k,v){storage[k]=v}},MutationObserver:undefined},{timeout:1500});
assert.equal(header.nodeValue,'Gemeten klikgroei');
assert.equal(research.nodeValue,'Open onderzoeksbrief · GSC niet nodig');
assert.equal(status.nodeValue,'Inhoudsonderzoek zonder GSC');
assert.equal(userData.nodeValue,'Clicks');
assert.equal(unknown.nodeValue,'exact query from customer');
assert.equal(doc.documentElement.lang,'nl');
assert.equal(doc.title,'Growth-metingen · ContentScale');
const select=elements.csUiLanguage;
assert(select,'Language selector must show on measurement page');
select.value='en';select.events.change();
assert.equal(header.nodeValue,'Measured click growth');
assert.equal(research.nodeValue,'Open research brief · no GSC required');
assert.equal(status.nodeValue,'CONTENT_RESEARCH');
assert.equal(doc.documentElement.lang,'en');
assert.equal(storage.cs_ui_language,'en');
assert.equal(userData.nodeValue,'Clicks');
console.log('PASS shared EN/NL Growth measurement and protected source data with reversible translations');
