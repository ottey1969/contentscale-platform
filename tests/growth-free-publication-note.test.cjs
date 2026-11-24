'use strict';
// Owner 2026-11-22: "wat er gedaan is in die pagina" — next to the publication date, a short note on what was changed. The
// editor (anyone with the result link) fills it in where the date is set; a suggestion is made from what Growth itself
// knows (explicit editor confirmations). An external AI gets one closing instruction in the brief. The GSC
// report shows the note under the "Updated on" chip. It is the editor's own statement: the tool does not verify it.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {noteSuggestion,cleanNote}=require('../src/growth-free/publication-note.cjs');
const {reportPage}=require('../src/gsc-report/routes.cjs');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
test('suggestion: only confirmed tasks; drafts and selections are not execution evidence',()=>{
 const written={version:2,runs:[{run:1,sections:[{item_id:'1',h2:'Wat niet werkt om in AI-overzichten te komen'},{item_id:'2',h2:'Wat je nu kunt doen'}]}]};
 assert.equal(noteSuggestion({written}),'');
 const summary={gaps:{items:[{id:'7',title:'Kosten en tarieven'},{id:'8',title:'Monitoren'}]}};
 assert.equal(noteSuggestion({selected_item_ids:['8'],summary},'en'),'');
 assert.equal(noteSuggestion({implementation:{a:{title:'Monitoren',done:true},b:{title:'Other',done:false}}},'en'),'Confirmed by editor: “Monitoren”.');
 assert.equal(noteSuggestion({summary}),'');
 assert.equal(cleanNote('  a\n\nb  <script>x</script> '),'a b <script>x</script>'.replace(/\s+/g,' ').trim());
 assert.equal(cleanNote('x'.repeat(900)).length,500);
});
test('report: the note shows under the date chip, escaped',()=>{
 const U='https://nl.contentscale.site/wat-is-een-ai-overview/';
 const growth=new Map([['https://nl.contentscale.site/wat-is-een-ai-overview',{published_on:'2026-11-22',note:'Sectie <b>“Wat niet werkt”</b> toegevoegd.',owner_result:null,invite_result:null}]]);
 const row={title:'x',lang:'nl',created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,growth_invite:null,
  report:{pages:[{rank:1,url:U,action:'NO_CLICKS',clicks:0,impressions:1227,ctr:0,position:64.2,basis:'TOO_FEW'}],bands:[],queries:{},files:[],notes:[],kpis:{}}};
 const html=reportPage(row,{owner:false,config:{},growthPath:'/free-growth',growth});
 assert.match(html,/Aangepast op 22 november 2026 \(Growth\)<\/span><div class="done-note">Sectie &lt;b&gt;“Wat niet werkt”&lt;\/b&gt; toegevoegd\.<\/div>/);
});
test('result page, brief and texts',()=>{
 const ui=fs.readFileSync(require.resolve('../src/growth-free/routes.cjs'),'utf8');
 assert.match(ui,/id="pubNote"/);assert.match(ui,/note:document\.getElementById\('pubNote'\)\.value/);
 assert.match(ui,/What was changed: /,'the brief asks an external AI for one closing line');
 const store=fs.readFileSync(require.resolve('../src/growth-free/store.cjs'),'utf8');
 assert.match(store,/addColumn\('published_note','TEXT'\)/);assert.match(store,/published_note=\$6/);
 for(const k of ['What did you change on the page? (shown in your GSC report)','What was changed: {q}'])assert.ok(ROWS.find(r=>r[0]===k),k);
});
// Owner 2026-11-22: "vul ze" — pages on nl.contentscale.site that already had a publication date get the note from what
// Growth recorded for that check. Only empty notes, only that host, only when Growth recorded something; never overwritten.
test('backfill: nl.contentscale.site published checks without a note get the Growth suggestion',async()=>{
 const {backfillNotes}=require('../src/growth-free/publication-note.cjs');
 const written={version:2,runs:[{run:1,sections:[{item_id:'1',h2:'Wat kost een AI-overzicht?'}]}]};
 const rows=[
  {id:1,url:'https://nl.contentscale.site/a/',published_on:'2026-11-20',published_note:null,written,implementation:{a:{title:'Wat kost een AI-overzicht?',done:true}},ui_lang:'nl'},
  {id:2,url:'https://nl.contentscale.site/b/',published_on:'2026-11-20',published_note:'Eigen tekst',written,ui_lang:'nl'},
  {id:3,url:'https://contentscale.site/c/',published_on:'2026-11-20',published_note:null,written,ui_lang:'nl'},
  {id:4,url:'https://nl.contentscale.site/d/',published_on:null,published_note:null,written,ui_lang:'nl'},
  {id:5,url:'https://nl.contentscale.site/e/',published_on:'2026-11-20',published_note:null,summary:{},ui_lang:'nl'}];
 const updates=[];
 const pool={query:async(sql,params)=>{
  if(/^SELECT/.test(sql.trim())){assert.match(sql,/published_on IS NOT NULL/);assert.match(sql,/published_note IS NULL/);assert.match(sql,/host=\$1/);
   return {rows:rows.filter(r=>r.published_on&&r.published_note==null&&new URL(r.url).host===params[0])}}
  assert.match(sql,/published_note IS NULL/,'never overwrites a note');updates.push(params);return {rowCount:1}}};
 const n=await backfillNotes(pool,{host:'nl.contentscale.site'});
 assert.equal(n,1);assert.deepEqual(updates,[[1,'Door redacteur bevestigd: “Wat kost een AI-overzicht?”.']]);
 const store=fs.readFileSync(require.resolve('../src/growth-free/store.cjs'),'utf8');
 assert.match(store,/backfillNotes\(pool,\{host:'nl\.contentscale\.site'\}\)/);
});
