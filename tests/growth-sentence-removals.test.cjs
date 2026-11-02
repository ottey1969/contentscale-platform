'use strict';
// Owner 2026-11-02: a flagged sentence removed with the button must be remembered (any browser), and the live page is
// never changed. The sentence is the owner's real flagged sentence of proposal #26.
const test=require('node:test'),assert=require('node:assert/strict');
const {saveRemoval,loadRemovals,hashOf}=require('../src/growth-sentence-removal-store.cjs');
const FLAG='To execute this step, an editor evaluates existing pages scored 90 or above to extract main takeaways, checklists, and key guidance.';
test('the same sentence with other quotes or spacing is one removal',()=>{
 assert.equal(hashOf(FLAG),hashOf('  '+FLAG.replace('step,','step,  ')));
 assert.equal(hashOf('“'+FLAG+'”'),hashOf('"'+FLAG+'"'));
});
const DB=process.env.GROWTH_E2E_DATABASE_URL;
test('remembered per client and page on the server (PostgreSQL)',{skip:!DB&&'GROWTH_E2E_DATABASE_URL not set'},async()=>{
 const {Pool}=require('pg'),pool=new Pool({connectionString:DB});
 try{
  await pool.query('DROP TABLE IF EXISTS tracker_growth_sentence_removals');
  assert.deepEqual(await loadRemovals(pool,{clientId:5,pageId:2295}),[],'no table yet: nothing remembered, no error');
  await saveRemoval(pool,{clientId:5,pageId:2295,sentence:FLAG});
  await saveRemoval(pool,{clientId:5,pageId:2295,sentence:FLAG+' '});
  assert.equal(await saveRemoval(pool,{clientId:5,pageId:2295,sentence:'short'}),null);
  const rows=await loadRemovals(pool,{clientId:5,pageId:2295});
  assert.equal(rows.length,1);assert.equal(rows[0].sentence,FLAG);assert.equal(rows[0].how,'REMOVED_BY_BUTTON');
  assert.deepEqual(await loadRemovals(pool,{clientId:5,pageId:1}),[],'another page knows nothing of it');
  assert.deepEqual(await loadRemovals(pool,{clientId:6,pageId:2295}),[],'another client knows nothing of it');
 }finally{await pool.query('DROP TABLE IF EXISTS tracker_growth_sentence_removals').catch(()=>{});await pool.end()}
});
