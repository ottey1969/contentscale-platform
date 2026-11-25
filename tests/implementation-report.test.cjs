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
