'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {patch,marker}=require('./integrate-tracker-growth-navigation.cjs');
const canonical=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const result=patch(canonical);
assert.equal(patch(result.source).changed,false,'canonical change must be idempotent');
assert(result.source.includes(marker),'direct Growth entry must exist');
assert(result.source.includes('href="/track/__TOKEN__/growth"'));
assert(result.source.includes('id="growthDirectNav"'));
assert(result.source.includes('src="/tracker-growth-ui.js"'));
assert(result.source.includes('1. Add Sitemap (GSC optional)'));
assert(!result.source.includes('1. Add Sitemap + GSC'));
assert(result.source.includes('id="briefLangSel"'),'SEO brief language setting remains untouched');
assert(result.source.includes('CONTENTSCALE_TRACKER_GSC_OPTIONAL_ADVICE_V1'),'GSC blocker remains disabled');
assert(result.source.includes('_tourMaybeAutoStart'),'guided Tracker tour remains available');
assert(result.source.includes('CONTENTSCALE_DIRECT_GROWTH_TOUR_STEP_V1'),'Growth must be reachable from the existing guided tour');
assert(result.source.includes("_tourSteps.push({sel:'#growthDirectNav'"),'Growth tour step links to the actual toolbar button');
const js=fs.readFileSync(path.resolve(__dirname,'../public/tracker-growth-ui.js'),'utf8');
assert(!js.includes('fetch('),'UI navigation must not call GSC or external providers');
function fixture(route,storage){
 const map={},added=[],first={appendChild(el){added.push(el);map[el.id]=el}};
 function element(type){
  return {tagName:type,children:[],style:{},dataset:{},textContent:'',setAttribute(){},addEventListener(event,fn){this.events=this.events||{};this.events[event]=fn},
   appendChild(child){this.children.push(child);if(child.id)map[child.id]=child},
   insertBefore(child){this.children.push(child);added.push(child);if(child.id)map[child.id]=child}};
 }
 if(route.endsWith('/growth')){
  map.h1=element('h1');map.h1.textContent='Growth Cockpit';
  map.trackerBack=element('a');
 }else{
  map.gbpAdvisorNav=element('a');map.gbpAdvisorNav.parentNode=element('div');map.tourBtn=element('button');map.tourBtn.textContent='✨ Guided Tour';
 }
 const doc={
  readyState:'complete',documentElement:{lang:'en'},
  getElementById(k){return map[k]||null},createElement:element,
  querySelector(q){if(q==='h1')return map.h1;if(q==='body > p a[href*="/track/"]')return map.trackerBack;if(q==='body > p')return first;return null},
  querySelectorAll(q){return []}
 };
 const context={document:doc,location:{pathname:route},
  localStorage:{getItem(k){return storage[k]||null},setItem(k,v){storage[k]=v}},
  MutationObserver:undefined};
 vm.runInNewContext(js,context,{timeout:1500});
 return {doc,map,added};
}
const storage={};
const tracker=fixture('/track/valid-share-token',storage);
assert.equal(tracker.map.growthDirectNav.href,'/track/valid-share-token/growth');
assert.equal(tracker.map.csUiLanguage.value,'en');
assert.equal(tracker.doc.documentElement.lang,'en');
tracker.map.csUiLanguage.value='nl';
tracker.map.csUiLanguage.events.change();
assert.equal(storage.cs_ui_language,'nl');
const growth=fixture('/track/valid-share-token/growth',storage);
assert.equal(growth.doc.documentElement.lang,'nl');
assert.equal(growth.map.h1.textContent,'Growth-overzicht');
growth.map.csUiLanguage.value='en';
growth.map.csUiLanguage.events.change();
assert.equal(storage.cs_ui_language,'en');
assert.equal(growth.map.h1.textContent,'Growth Cockpit');
assert(!js.includes('cs_brief_language'),'UI language cannot override briefs');
console.log('PASS: direct Growth access and shared English/Nederlands language, no GSC gate, safe Tracker/Case Study tour unaffected');
