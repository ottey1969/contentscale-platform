'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseImplementationReport,VERSION}=require('../src/implementation-report.cjs');
const url='https://example.com/page/';
const now=new Date('2026-11-25T12:00:00Z');
const report={schema:VERSION,url,status:'published',published_at:'2026-11-25T10:00:00Z',summary:'Updated the page headings and schema.',change_types:['content','schema'],evidence:'commit abc123'};
const parse=(r)=>parseImplementationReport(JSON.stringify(r),url,now);
test('valid report supplies actual page change fields without claiming verification',()=>{
 const r=parse(report);assert.equal(r.published_on,'2026-11-25');assert.equal(r.summary,report.summary);assert.equal(r.verified,false);assert.equal(r.evidence,report.evidence);
});
test('wrong page, invalid dates and unsupported claims are rejected',()=>{
 for(const patch of [{url:'https://example.com/other/'},{url:'https://example.com/page/?q=1'},{published_at:'2026-11-26T10:00:00Z'},{published_at:'2026-02-30T10:00:00Z'},{published_at:'2026-11-25'},{summary:''},{summary:'x'.repeat(501)},{change_types:['verified']},{schema:'unknown'}])assert.throws(()=>parse({...report,...patch}));
});
test('unpublished work cannot populate a publication date',()=>{
 for(const status of ['implemented','not_published']){
  assert.equal(parse({...report,status,published_at:null}).published_on,null);
  assert.throws(()=>parse({...report,status}));
 }
});
test('Free Growth uses the existing publication save and a separate read-only import preview',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 assert.ok(s.includes('What changes were implemented on this page?'));
 assert.ok(s.includes('contentscale.implementation.v1'));
 assert.ok(s.includes("report.status!=='published'"));
 assert.ok(s.includes('/implementation-report/preview'));
 assert.ok(s.includes("parseImplementationReport(raw,row.url)"));
 assert.ok(s.includes("date.value=report.published_on;note.value=report.summary;"));
});

test('owner reports preserve editor evidence and publication uncertainty in every language',()=>{
 const {ownerReport}=require('../src/implementation-report.cjs');
 for(const lang of ['en','nl','es']){
  const text=ownerReport(parse(report),lang);
  assert.ok(text.includes(report.summary));assert.ok(text.includes(report.url));assert.ok(text.includes(report.published_at));assert.ok(text.includes(report.evidence));
  const draft=ownerReport(parse({...report,status:'implemented',published_at:null}),lang);
  assert.ok(!draft.includes(report.published_at));
 }
});
test('both existing Free Growth emails include saved page changes safely',()=>{
 const {confirmationMessage,reminderMessage}=require('../src/growth-free/reminders.cjs');
 const base={url,publishedOn:'2026-11-25',stopLink:'https://example.com/stop',resultLink:'https://example.com/result',note:'Added <script>alert(1)</script> & headings'};
 for(const [lang,label] of [['en','Recorded page changes'],['nl','Geregistreerde paginawijzigingen'],['es','Cambios registrados en la página']]){
  for(const make of [confirmationMessage,reminderMessage]){
   const {html}=make({...base,lang});
   assert.ok(html.includes(label));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&amp; headings'));assert.ok(!html.includes('<script>'));
   assert.ok(!make({...base,lang,note:null}).html.includes(label));
  }
 }
});
test('scheduled email receives the saved publication note without additional sends',async()=>{
 const {sendDueFreeReminders}=require('../src/growth-free/reminders.cjs');const sent=[],marked=[];
 const storage={dueReminders:async()=>[{id:1,url,email:'owner@example.com',published_on:'2026-11-25',published_note:'Added headings',ui_lang:'en',reminder_token:'token'}],markReminder:async(pool,data)=>marked.push(data)};
 await sendDueFreeReminders({},storage,{send:async m=>{sent.push(m);return true},links:{result:()=>url,stop:()=>url}});
 assert.equal(sent.length,1);assert.ok(sent[0].html.includes('Added headings'));assert.deepEqual(sent[0].to,['owner@example.com']);assert.deepEqual(marked,[{id:1,sent:true}]);
});
