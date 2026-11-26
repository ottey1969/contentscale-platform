'use strict';
// Owner 2026-11-22 (screenshot: "Aangepast op …" without a note): the note backfill only ran when a Free Growth page was
// opened; the GSC report reads growth_free_checks without that setup. Opening the report must run it too.
const test=require('node:test'),assert=require('node:assert/strict');
test('opening the GSC report runs the Free Growth setup, so the nl.contentscale.site notes get filled',async()=>{
 const sqls=[];
 const pool={query:async(sql)=>{sqls.push(String(sql));return {rows:[],rowCount:0}}};
 const {growthFor}=require('../src/gsc-report/published.cjs');
 await growthFor(pool,['https://nl.contentscale.site/wat-is-een-ai-overview/'],{owner:true,reportId:1});
 assert.ok(sqls.some(s=>/published_note IS NULL AND host=\$1/.test(s)),'backfill query ran');
 const iBack=sqls.findIndex(s=>/published_note IS NULL AND host=\$1/.test(s)),iRead=sqls.findIndex(s=>/FROM growth_free_checks c\s+WHERE c.status='DONE'/.test(s));
 assert.ok(iRead>iBack,'notes are filled before the report reads them');
});
