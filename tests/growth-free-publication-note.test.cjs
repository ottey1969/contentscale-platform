'use strict';
// Owner 2026-11-22: "wat er gedaan is in die pagina" — next to the publication date, a short note on what was changed. The
// editor (anyone with the result link) fills it in where the date is set; a suggestion is made from what Growth itself
// knows (the H2s it wrote, else the chosen topics). An external AI gets one closing instruction in the brief. The GSC
// report shows the note under the "Updated on" chip. It is the editor's own statement: the tool does not verify it.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {noteSuggestion,cleanNote}=require('../src/growth-free/publication-note.cjs');
const {reportPage}=require('../src/gsc-report/routes.cjs');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
test('suggestion: the H2s Growth wrote, else the chosen topics; nothing invented',()=>{
 const written={version:2,runs:[{run:1,sections:[{item_id:'1',h2:'Wat niet werkt om in AI-overzichten te komen'},{item_id:'2',h2:'Wat je nu kunt doen'}]}]};
 assert.equal(noteSuggestion({written}),'Toegevoegd: “Wat niet werkt om in AI-overzichten te komen”, “Wat je nu kunt doen”.');
 const summary={gaps:{items:[{id:'7',title:'Kosten en tarieven'},{id:'8',title:'Monitoren'}]}};
 assert.equal(noteSuggestion({selected_item_ids:['8'],summary},'en'),'Added: “Monitoren”.');
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
