'use strict';
// Owner 2026-11-21 (screenshot "Pagina's per positiegroep"): "tabel gegevens centered zodat ik beter kan zien waar het bij
// hoort". The number headers were left-aligned and the numbers right-aligned, so a number looked like it belonged to the
// next column. Number columns are centred, heading and value alike; the phone card layout keeps its own alignment.
const test=require('node:test'),assert=require('node:assert/strict');
const {reportPage}=require('../src/gsc-report/routes.cjs');
test('number columns: heading and value centred together; phone cards unchanged',()=>{
 const html=reportPage({title:'x',lang:'nl',created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,report:{pages:[],bands:[{band:'1-3',pages:0,clicks:0,impressions:0,median_ctr:null,compared_pages:0}],queries:{},files:[],notes:[],kpis:{}}},{owner:false,config:{},growthPath:'/free-growth'});
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const base=css.slice(0,css.indexOf('@media'));
 assert.match(base,/\.tbl th\.num,\.tbl td\.num\{text-align:center\}/);
 assert.ok(css.indexOf('.tbl th.num,.tbl td.num{text-align:center}')<css.indexOf('.ptbl td.num{display:flex'),'the phone card rule comes later and wins');
 assert.match(html,/<th class="num">Pagina’s<\/th>/);
});
