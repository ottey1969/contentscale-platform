'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {noteSuggestion}=require('../src/growth-free/publication-note.cjs');
test('selected and drafted topics alone are not implementation evidence',()=>{
 assert.equal(noteSuggestion({selected_item_ids:['a'],summary:{gaps:{items:[{id:'a',title:'Draft topic'}]}},written:{sections:[{item_id:'a',h2:'Draft heading'}]}}),'');
});
test('confirmed editor tasks produce an explicitly attributed suggestion',()=>{
 assert.match(noteSuggestion({implementation:{a:{title:'Add FAQ',done:true},b:{title:'Other',done:false}}},'nl'),/Add FAQ/);
 assert.doesNotMatch(noteSuggestion({implementation:{a:{title:'Add FAQ',done:true},b:{title:'Other',done:false}}},'nl'),/Other/);
});

test('historical comparisons keep exact-page exports in their respective windows',()=>{
 const {compareHistory,windowsOf}=require('../src/growth-free/reminders.cjs');
 const dates=['2026-08-01','2026-09-15'];
 const w=dates.map(windowsOf);
 const upload=(p,clicks,status='VERIFIED_FOR_PAGE')=>({status,period_start:p.start,period_end:p.end,totals:{clicks,impressions:100},queries:[]});
 const results=compareHistory(dates.map(published_on=>({published_on})),[upload(w[0].before,1),upload(w[0].after,2),upload(w[1].before,3),upload(w[1].after,4),upload(w[1].after,999,'WRONG_PAGE')],'roof repair');
 assert.equal(results.length,2);
 assert.deepEqual(results.map(x=>[x.before.totals.clicks,x.after.totals.clicks]),[[1,2],[3,4]]);
});
test('historical comparisons disclose overlap and do not invent missing data',()=>{
 const {compareHistory,windowsOf}=require('../src/growth-free/reminders.cjs');
 const date='2026-11-01',other='2026-11-10',w=windowsOf(date);
 const results=compareHistory([{published_on:date},{published_on:other}],[
 {status:'VERIFIED_FOR_PAGE',period_start:w.before.start,period_end:w.after.end,totals:{clicks:42}}
 ],'roof repair');
 assert.equal(results[0].before,null);assert.equal(results[0].after,null);
 assert.deepEqual(results[0].overlapping_publications,[other]);
 assert.deepEqual(results[1].overlapping_publications,[date]);
});
