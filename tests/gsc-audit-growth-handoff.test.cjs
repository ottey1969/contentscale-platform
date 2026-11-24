'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditUpload}=require('../src/growth-free/gsc-audit-handoff.cjs');
const row={title:'Audit',growth_invite:'secret',created_at:'2026-11-24T00:00:00Z',report:{kpis:{period:{start:'2026-10-01',end:'2026-10-31'}},pages:[{url:'https://example.com/A',source:'EXPORT',clicks:2,impressions:100,position:8,queries:[{query:'page question',clicks:1,impressions:10,position:7}]},{url:'https://example.com/B',source:'CRAWL',clicks:null,impressions:null}],queries:{top:[{query:'domain only'}]}}};
test('authorized exact page keeps original period and never borrows domain queries',()=>{
 const u=auditUpload(row,{url:'https://example.com/A',owner:true});
 assert.equal(u.upload.status,'VERIFIED_FOR_PAGE');assert.equal(u.upload.period.start,'2026-10-01');assert.equal(u.upload.totals.impressions,100);assert.deepEqual(u.upload.queries.map(q=>q.query),['page question']);
 assert.equal(auditUpload(row,{url:'https://example.com/a',owner:true}),null);
 assert.equal(auditUpload(row,{url:'https://example.com/B',owner:true}),null);
 assert.equal(auditUpload(row,{url:'https://example.com/A',invite:'wrong'}),null);
 assert.ok(auditUpload(row,{url:'https://example.com/A',invite:'secret'}));
});
