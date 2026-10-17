'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {patch,start,end,marker}=require('./fix-tracker-optional-gsc-advice.cjs');
const original=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const result=patch(original),s=result.source;
assert.equal(patch(s).changed,false,'GSC fix must be idempotent');
assert(s.includes(marker));
assert(!s.includes('GSC is mandatory in Tracker'));
assert(!s.includes('Required before Tracker can continue'));
assert(s.includes('Tracker workflow \\u2014 GSC is optional'));
assert(s.includes('Optional \\u2014 Connect Google Search Console'));
assert(s.includes('Optional \\u2014 Import GSC data'));
const i=s.indexOf(start),e=s.indexOf(end,i);
assert(i>=0&&e>i);
const section=s.slice(i,e);
assert(!section.includes('position:fixed'));
assert(!section.includes('document.body.appendChild'));
assert(section.includes("host.prepend(note)"));
assert(section.includes('Missing GSC data is not zero traffic'));
const make=()=>{
 const elements={};
 const mk=tag=>({
  tag,children:[],style:{},textContent:'',setAttribute(k,v){this[k]=v},
  appendChild(v){this.children.push(v)},
  prepend(v){this.children.unshift(v);elements[v.id]=v},
  remove(){this.removed=true;delete elements[this.id]}
 });
 elements.gscSetupBanner=mk('div');
 return {elements,document:{getElementById(id){return elements[id]||null},createElement:mk}};
};
for(const status of [null,{connected:false},{required:true,connected:false,available:false}]){
 const view=make();
 const context={document:view.document,_NETWORK_PREWRITE_AUTHORIZED:false};
 vm.runInNewContext(section+';this.show=_renderGscRequiredGate;',context);
 context.show(status);
 assert.equal(view.elements.gscSetupBanner.children.length,1,'show inline advice');
 assert.equal(view.elements.gscSetupBanner.children[0].id,'csGscOptionalAdvice');
 assert(view.elements.csGscOptionalAdvice.children.some(x=>/Connect Google Search Console/.test(x.textContent)));
 context.show({connected:true});
 assert(!view.elements.csGscOptionalAdvice,'connected state removes advice');
}
const embed=make();const c={document:embed.document,_NETWORK_PREWRITE_AUTHORIZED:true};
vm.runInNewContext(section+';this.show=_renderGscRequiredGate;',c);
c.show({connected:false});
assert.equal(embed.elements.gscSetupBanner.children.length,0,'Network Prewrite unaffected');
assert.strictEqual(s.slice(0,i),original.slice(0,original.indexOf(start)),'no upstream logic changed');
console.log('PASS: initial load, disconnected, failed GSC check and connected states never block Tracker; optional inline advice only');
