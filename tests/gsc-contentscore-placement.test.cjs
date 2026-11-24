'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reportPage}=require('../src/gsc-report/routes.cjs');
test('GRAAF is offered in the work list and never in the technical issues view',()=>{
 const pages=[{url:'https://example.com/good',rank:1,action:'NO_CLICKS'},{url:'https://example.com/blocked',rank:2,action:'BLOCKED',audit:{issues:['NOINDEX'],h1:[],hreflang:[],notes:[],words:100}}];
 const row={token:'test-token',title:'Test',lang:'en',created_at:new Date(),expires_at:new Date(Date.now()+864e5),report:{pages,kpis:{audit:{with_issues:1,blocked:1}},bands:[],queries:{},files:[],notes:[]}};
 const opt={owner:true,config:{},growthPath:'/free-growth'};
 assert.match(reportPage(row,opt),/data-cs-scan[^>]+data-url="https:\/\/example.com\/good"/);
 assert.doesNotMatch(reportPage(row,{...opt,issueView:'all'}),/data-cs-scan/);
});
