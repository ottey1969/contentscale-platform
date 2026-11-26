'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {registerNetwork}=require('../src/register-network.js');
const {registerNetwork:registerCanonicalNetwork}=require('../src/network/register-network.js');
const KEYWORD='seo content optimalisatie';
const ANSWER='SEO content optimalisatie begins by checking what the visitor expects, auditing existing content, using verified sources, and improving relevant paragraphs, internal links and accuracy. Rank and citations are not guaranteed.';
function brief(valid=true){
 const ai_system_evidence={};
 for(const k of ['google_aio','chatgpt','perplexity','claude','copilot']){
  ai_system_evidence[k]={checked:true,text:valid||k!=='claude'?ANSWER:'',...(k==='google_aio'?{google_source:'gemini'}:{})};
 }
 return {ai_system_evidence,prewrite_ai_answer_research:{query:KEYWORD}};
}
function fixture({valid=true,owner=false,outline=5}={}){
 const b=brief(valid),hash=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
 const briefRow={id:9,keyword:KEYWORD,working_title:'SEO content optimalisatie',language:'nl-NL',region:'NL',brief_json:b};
 const approval={id:2,prewrite_brief_id:9,brief_hash:hash,brief_snapshot:b,
  approved_contract:{planned_h2s:Array.from({length:outline},(_,i)=>'Verified H2 '+(i+1)),minimum_useful_words:1200},approved_at:'2026-11-07T00:00:00Z'};
 const writes=[];
 const pool={async query(sql){const q=String(sql);if(/^\s*(INSERT|UPDATE|DELETE)/i.test(q))writes.push(q);
  if(q.includes('FROM prewrite_briefs WHERE id=$1 LIMIT 1'))return {rows:[briefRow]};
  if(q.includes('FROM network_prewrite_approvals WHERE'))return {rows:[approval]};
  if(q.includes('FROM network_websites WHERE id=$1 LIMIT 1'))return {rows:owner?[{id:1,domain:'example.com',brand_name:'Example',primary_niche:'Marketing'}]:[]};
  return {rows:[]}}};
 const routes=new Map(),app={};
 for(const method of ['get','post','patch','delete'])app[method]=(path,...fns)=>routes.set(method.toUpperCase()+' '+path,fns[fns.length-1]);
 registerNetwork({app,pool,verifyAdmin:(req,res,next)=>next(),asyncHandler:fn=>fn});
 const call=async (path,body)=>{
  const handler=routes.get('POST '+path);assert.ok(handler,'route registered '+path);
  const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this},type(){return this},send(v){this.body=v;return this}};
  await handler({body,params:{placementId:1},query:{}},res);return res;
 };
 return {call,writes};
}
test('real Network standalone route rejects an old checked:true invalid AI answer before any writing',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({valid:false,owner:true});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.match(r.body.error,/AI evidence is incomplete or invalid/i);assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('real standalone route requires owner website to verify internal links before writing',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({owner:false});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.equal(r.body.stage,'website');assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('real standalone route refuses a Brief outline too short for the publication standard',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({owner:true,outline:3});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.equal(r.body.stage,'outline');assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('Network Google capture requires explicit AI Overview/Gemini provenance before DB writes',async()=>{
 const f=fixture();const r=await f.call('/api/network/admin/publications/:placementId/ai-evidence',{engine:'google_aio',evidence:ANSWER});
 // Missing placement is checked only after source provenance; no DB changes.
 assert.equal(r.statusCode,422);assert.match(r.body.error,/Choose the actual Google source/);assert.equal(f.writes.length,0);
});

test('Canonical Network saves valid research only and reports the validated five-engine count', async () => {
 const saved = brief(false);
 const writes = [];
 const route = '/api/network/admin/publications/:placementId/ai-evidence';
 let placementStatus = 'accepted';
 let handle;
 const app = { post(path, ...handlers) { if (path === route) handle = handlers.at(-1); } };
 for (const method of ['get', 'patch', 'put', 'delete', 'use']) app[method] = () => {};
 const placement = () => ({ id: 1, status: placementStatus, prewrite_brief_id: 9, publication_version_id: 42,
   generation_input_snapshot: { official_contentscore_scan: { score: 92 } } });
 const pool = {
  async query() { return { rows: [placement()] }; },
  async connect() {
   return {
    async query(sql, params) {
     if (sql.includes('FROM network_placements p')) return { rows: [placement()] };
     if (sql.includes('FROM prewrite_briefs')) return {rows: [{id: 9, keyword: KEYWORD, brief_json: structuredClone(saved)}]};
     if (sql.startsWith('UPDATE')) writes.push(JSON.parse(params[1]));
     return { rows: [] };
    },
    release() {}
   };
  }
 };
 registerCanonicalNetwork({ app, pool, verifyAdmin() {}, asyncHandler: fn => fn });
 assert.equal(typeof handle, 'function');
 async function capture(body) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(result) { this.body = result; } };
  await handle({ params: {placementId: 1}, body }, res);
  return res;
 }
 assert.equal((await capture({engine: 'google_aio', evidence: ANSWER})).statusCode, 422);
 assert.equal((await capture({engine: 'claude', evidence: '[PASTE ANSWER HERE]'})).statusCode, 422);
 assert.equal(writes.length, 0);
 const google = await capture({engine: 'google_aio', google_source: 'gemini', evidence: ANSWER});
 assert.equal(google.body.checked_count, 4);
 assert.equal(google.body.complete_5_of_5, false);
 assert.equal(writes[0].ai_system_evidence.google_aio.google_source, 'gemini');
 const approved = await capture({engine: 'claude', evidence: ANSWER});
 assert.equal(approved.statusCode, 200);
 assert.equal(approved.body.complete_5_of_5, true);
 assert.equal(writes[2].what_we_checked.ai_systems_checked, 5);
 assert.equal(writes.length, 4);
 for (const status of ['submitted', 'verifying', 'verified']) {
  placementStatus = status;
  const live = await capture({ engine: 'claude', evidence: ANSWER });
  assert.equal(live.statusCode, 409, 'live research may not revise the approved Publisher Edition');
  assert.equal(writes.length, 4);
 }
});

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Network research capture sees a concurrent publication submission and leaves the approved edition intact', {
 skip: !isolated && 'requires disposable local PostgreSQL', timeout: 15000
}, async () => {
 const { Pool } = require('pg');
 const schema = 'live_research_' + crypto.randomBytes(8).toString('hex');
 const control = new Pool({ connectionString: database, max: 1 });
 const db = new Pool({ connectionString: database, options: '-c search_path=' + schema, max: 3 });
 let submission;
 try {
  await control.query('CREATE SCHEMA ' + schema);
  await db.query(`CREATE TABLE network_placements (id INT PRIMARY KEY, content_id INT, status TEXT);
    CREATE TABLE network_content (id INT PRIMARY KEY, prewrite_brief_id INT);
    CREATE TABLE network_publication_versions (id INT PRIMARY KEY, placement_id INT, generation_input_snapshot JSONB,
      quality_status TEXT, updated_at TIMESTAMPTZ);
    CREATE TABLE prewrite_briefs (id INT PRIMARY KEY, keyword TEXT, brief_json JSONB);
    INSERT INTO network_placements VALUES (1,5,'ready');
    INSERT INTO network_content VALUES (5,9);
    INSERT INTO network_publication_versions VALUES (42,1,'{"official_contentscore_scan":{"score":92}}','approved',NOW())`);
  const prewrite = brief(false);
  await db.query('INSERT INTO prewrite_briefs VALUES (9,$1,$2)', [KEYWORD, JSON.stringify(prewrite)]);

  let capture;
  const app = { post(path, ...handlers) {
   if (path === '/api/network/admin/publications/:placementId/ai-evidence') capture = handlers.at(-1);
  } };
  for (const method of ['get', 'patch', 'put', 'delete', 'use']) app[method] = () => {};
  let reachedCapture;
  const captureStarted = new Promise(resolve => { reachedCapture = resolve; });
  const observedPool = {
   query: (...args) => db.query(...args),
   async connect() {
    const conn = await db.connect();
    return { query(sql, ...args) {
     const result = conn.query(sql, ...args);
     if (sql.includes('FROM network_placements p') && sql.includes('FOR UPDATE OF p')) reachedCapture();
     return result;
    }, release: () => conn.release() };
   }
  };
  registerCanonicalNetwork({ app, pool: observedPool, verifyAdmin() {}, asyncHandler: fn => fn });
  submission = await db.connect();
  await submission.query('BEGIN');
  await submission.query("UPDATE network_placements SET status='submitted' WHERE id=1");
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  const request = capture({ params: { placementId: 1 }, body: { engine: 'claude', evidence: ANSWER } }, res);
  await Promise.race([captureStarted, request]);
  await submission.query('COMMIT');
  await request;
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'live_publication_research_locked');
  const { rows: [version] } = await db.query('SELECT generation_input_snapshot,quality_status FROM network_publication_versions');
  assert.deepEqual(version, { generation_input_snapshot: { official_contentscore_scan: { score: 92 } }, quality_status: 'approved' });
  assert.deepEqual((await db.query('SELECT brief_json FROM prewrite_briefs')).rows[0].brief_json, prewrite);
 } finally {
  if (submission) {
   await submission.query('ROLLBACK').catch(() => {});
   submission.release();
  }
  await db.end();
  try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
  finally { await control.end(); }
 }
});
