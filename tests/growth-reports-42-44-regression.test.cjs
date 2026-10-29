'use strict';
// Production report 44 (2026-10-29): a "reader task" was derived from the verb "offer" shared by a buying-guide heading
// ("They Offer the Best Warranties") and a competitor's own sales copy ("A & J Reliable, Inc. offers flexible payment plans").
const test=require('node:test'),assert=require('node:assert/strict');
const {deriveReaderTasksDetailed,isPromotionalSection,IGNORED}=require('../src/growth-derived-reader-tasks.cjs');
const fx=require('./fixtures/growth-reports-42-44/report-44-offer-sections.json');
const by=h=>fx.sections.find(s=>s.host===h);
const comps=fx.sections.map(s=>({host:s.host,url:s.url,sections:[{heading:s.heading,text:s.text}]}));

test('report 44: production derived a task from the shared verb "offer"',()=>{
 assert.equal(fx.production_task.key,'offer');
});

test('report 44: a transaction verb is never a reader task',()=>{
 for(const w of ['offer','offers','offered','provide','provides','deliver'])assert.ok(IGNORED.has(w),w);
 const out=deriveReaderTasksDetailed({query:fx.query,competitors:comps});
 assert.deepEqual(out.tasks,[],'no task from two sections that share only "offer"');
});

test('report 44: "<brand> offers …" plus "our … contractors" is the competitor selling itself',()=>{
 const aj=by('ajreliable.com'),crs=by('crsroofing.net');
 assert.equal(isPromotionalSection({heading:aj.heading,text:aj.text},aj.host,crs.text.toLowerCase()),true);
 // The buying-guide section about warranties is reader information, not a sales block.
 assert.equal(isPromotionalSection({heading:crs.heading,text:crs.text},crs.host,aj.text.toLowerCase()),false);
 // Generic occupations, not trades: "our certified installers", "our two consultants" count as self-description too.
 const t='Our certified installers handle the permit. We schedule the visit within a week and our two consultants explain every option before work starts.';
 assert.equal(isPromotionalSection({heading:'Installation',text:t},'example-installs.example',''),true);
});

test('report 44: two sites that both explain warranties still form a task',()=>{
 const crs=by('crsroofing.net');
 const other={host:'roof-guide.example',url:'https://roof-guide.example/warranty/',sections:[{heading:'Manufacturer versus workmanship warranties',
  text:'A manufacturer warranty covers defective shingles, while a workmanship warranty covers installation mistakes. Ask how long each warranty lasts, whether the warranty is transferable when you sell the house, and which warranty registration steps the installer must complete.'}]};
 const out=deriveReaderTasksDetailed({query:fx.query,competitors:[{host:crs.host,url:crs.url,sections:[{heading:crs.heading,text:crs.text}]},other]});
 assert.ok(out.tasks.some(t=>/^warran/.test(t.key)),JSON.stringify(out.tasks.map(t=>t.key)));
});
