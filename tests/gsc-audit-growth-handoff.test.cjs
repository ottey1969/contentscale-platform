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

test('differences only compare verified totals for the same period',()=>{
 const {auditDifference}=require('../src/growth-free/gsc-audit-handoff.cjs');
 const a={basis:'GSC_AUDIT_EXACT_PAGE',status:'VERIFIED_FOR_PAGE',period_start:'2026-10-01',period_end:'2026-10-31',totals:{clicks:2,impressions:100,position:8}};
 const b={...a,basis:'EXACT_PAGE_FILTER',totals:{clicks:3,impressions:120,position:8.01}};
 assert.deepEqual(auditDifference([a,b]),{status:'DIFFERENT_TOTALS',differences:{clicks:{audit:2,page:3},impressions:{audit:100,page:120}}});
 assert.equal(auditDifference([a,{...b,period_end:'2026-11-01'}]).status,'DIFFERENT_PERIODS');
 assert.equal(auditDifference([a,{...b,status:'NOT_VERIFIED_FOR_PAGE'}]),null);
 assert.equal(auditDifference([a,{...b,totals:a.totals}]).status,'MATCH');
});
