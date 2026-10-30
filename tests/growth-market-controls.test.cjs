'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/growth-market-controls.js'),'utf8');
function setup(fetcher){
 const nodes={};
 for(const id of ['marketSetting','marketSave','marketSaid','marketInput','marketLanguage']){
  nodes[id]={textContent:id==='marketSave'?'Save and run the research again':'',dataset:{},attrs:{},
   setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return id==='marketSetting'&&k==='data-url'?'/api/tracker-client/token/growth/markets?page_id=2324':null},
   addEventListener(k,fn){this[k]=fn}};
 }
 nodes.marketInput.value='nl — Netherlands';nodes.marketLanguage.value='English';
 let reloads=0,requests=[];
 const ctx={document:{getElementById(id){return nodes[id]||null}},
  window:{location:{reload(){reloads++}}},fetch:async(url,arg)=>{requests.push({url,arg});return fetcher(url,arg)}};
 vm.runInNewContext(source,ctx);
 return {nodes,requests,get reloads(){return reloads}};
}
test('market button: saves market, shows feedback, reloads and cannot double click during save',async()=>{
 let resolve;const ui=setup(()=>new Promise(r=>{resolve=r}));
 const pending=ui.nodes.marketSave.click();assert.equal(ui.nodes.marketSave.disabled,true);
 assert.match(ui.nodes.marketSave.textContent,/Saving/);
 const duplicate=ui.nodes.marketSave.click();assert.equal(ui.requests.length,1);
 resolve({ok:true,json:async()=>({success:true,markets:{countries:['NL'],language:'en'}})});
 await pending;await duplicate;
 assert.equal(ui.reloads,1);assert.match(ui.nodes.marketSaid.textContent,/saved/);assert.equal(ui.nodes.marketSave.dataset.state,'saved');
 const body=JSON.parse(ui.requests[0].arg.body);assert.equal(body.countries,'nl — Netherlands');assert.equal(body.language,'English');
});
test('market button: validation failure stays visible and allows retry',async()=>{
 const ui=setup(async()=>({ok:false,status:400,json:async()=>({success:false,code:'UNKNOWN_COUNTRY'})}));
 await ui.nodes.marketSave.click();
 assert.equal(ui.reloads,0);assert.equal(ui.nodes.marketSave.disabled,false);
 assert.equal(ui.nodes.marketSaid.dataset.state,'error');assert.match(ui.nodes.marketSaid.textContent,/valid markets/);
});
test('market button: non-JSON error remains actionable',async()=>{
 const ui=setup(async()=>({ok:false,status:502,json:async()=>{throw Error('not json')}}));
 await ui.nodes.marketSave.click();
 assert.equal(ui.nodes.marketSave.disabled,false);assert.match(ui.nodes.marketSaid.textContent,/INVALID_SERVER_RESPONSE/);
});
