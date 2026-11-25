'use strict';
// Contacts per country (owner 2026-11-12): the free rank tracker and Free Growth only, per country, tips consent, website
// and keywords; delete one and delete a whole selection (typed DELETE); owner-only. Real PostgreSQL, TEST data only.
const test = require('node:test'), assert = require('node:assert/strict');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';

test('contacts per country: list, filter, CSV, delete one, delete selection — rank tracker and Free Growth', { skip, timeout: 60000 }, async () => {
  const pool = new pg.Pool({ connectionString: DB });
  const express = require('express');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const rank = require('../src/rank-free/store.cjs').pgStore(pool), growth = require('../src/growth-free/store.cjs');
  try {
    await rank.findAccountByEmail('x@x.example'); await growth.ensureTables(pool);
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@contacts-test.example'");
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE '%@contacts-test.example'");
    const add = (email, gl, consent, host, kw) => rank.upsertSignup({ email, lang: 'en', ipHash: 'h', consent, verifyHash: 'v-' + email, host, gl, hl: 'en', keywords: kw });
    await add('ann@contacts-test.example', 'nl', true, 'ann.example', ['dakreparatie amsterdam', 'lekkage dak']);
    await add('bob@contacts-test.example', 'us', false, 'bob.example', ['roof repair nj']);
    await add('cas@contacts-test.example', 'nl', false, 'cas.example', ['schilder utrecht']);
    await add('dan@contacts-test.example', 'nl', true, 'dan.example', ['dakgoot']);
    // Confirmed e-mail addresses (ann, bob, cas); dan never confirmed: wanted tips, but is not counted as "tips".
    for (const e of ['ann', 'bob', 'cas']) await pool.query('UPDATE rank_free_accounts SET verified_at=NOW() WHERE email=$1', [e + '@contacts-test.example']);
    const check = (email, countries, consent, url, query) => pool.query(`INSERT INTO growth_free_checks(public_id,access_key,email,ip_hash,url,host,query,status,marketing_consent,market)
      VALUES($1,'k',$2,'h',$3,'h.example',$4,'DONE',$5,$6)`, ['c' + Math.random().toString(36).slice(2, 12), email, url, query, consent, countries ? JSON.stringify({ countries, language: 'en' }) : null]);
    await check('dee@contacts-test.example', ['es'], true, 'https://dee.example/a/', 'reparacion tejado');
    await check('dee@contacts-test.example', ['es'], false, 'https://dee.example/b/', 'goteras madrid');
    await check('eve@contacts-test.example', null, false, 'https://eve.example/', 'roof leak');

    const app = express(); app.use(express.json());
    registerFreeGrowth(app, pool, { config: { ...freeGrowthConfig({}), adminKey: 'admin-secret-0123456789' } });
    const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
    const req = async (method, p, body, h = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; return { status: r.status, body: t.includes('json') ? await r.json() : await r.text() }; };
    try {
      assert.equal((await req('GET', '/api/free-growth/admin/contacts?source=rank')).status, 404, 'owner only');
      const login = await fetch(base + '/api/free-growth/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'admin-secret-0123456789' }) });
      const jar = { cookie: login.headers.get('set-cookie').split(';')[0] }, w = { ...jar, 'X-Requested-With': 'growth-free-admin' };
      const mine = rows => rows.filter(r => /@contacts-test\.example$/.test(r.email));
      // Rank tracker: per country, tips, website and keywords.
      let r = (await req('GET', '/api/free-growth/admin/contacts?source=rank&country=NL', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email).sort(), ['ann@contacts-test.example', 'cas@contacts-test.example', 'dan@contacts-test.example']);
      assert.equal(mine(r.rows).find(x => x.email.startsWith('dan')).tips, false, 'unconfirmed address: no tips');
      const ann = mine(r.rows).find(x => x.email.startsWith('ann'));
      assert.equal(ann.country, 'NL'); assert.equal(ann.tips, true); assert.equal(ann.host, 'ann.example'); assert.deepEqual(ann.keywords, ['dakreparatie amsterdam', 'lekkage dak']);
      assert.ok(r.countries.some(c => c.country === 'NL' && c.contacts >= 2 && c.tips >= 1));
      r = (await req('GET', '/api/free-growth/admin/contacts?source=rank&country=NL&tips=1', null, jar)).body;
      assert.deepEqual(mine(r.rows).map(x => x.email), ['ann@contacts-test.example'], 'tips only');
      const csv = (await req('GET', '/api/free-growth/admin/contacts.csv?source=rank&country=NL', null, jar)).body;
      assert.match(csv, /^country,email,tips,website,keywords/); assert.match(csv, /"NL","ann@contacts-test\.example","yes","ann\.example","dakreparatie amsterdam \| lekkage dak"/);
      // Free Growth: one row per e-mail, country from the chosen market, latest page and search term; unknown country.
      r = (await req('GET', '/api/free-growth/admin/contacts?source=growth&country=ES', null, jar)).body;
      const dee = mine(r.rows)[0]; assert.equal(dee.email, 'dee@contacts-test.example'); assert.equal(dee.checks, 2); assert.equal(dee.tips, true); assert.equal(dee.query, 'goteras madrid');
      r = (await req('GET', '/api/free-growth/admin/contacts?source=growth&country=NONE', null, jar)).body;
      assert.ok(mine(r.rows).some(x => x.email === 'eve@contacts-test.example'), 'no market chosen and no research yet: unknown country');
      // Delete one: CSRF header required; all data of that person in that source.
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'rank', id: ann.id }, jar)).status, 404, 'cookie alone cannot delete');
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'rank', id: ann.id }, w)).body.deleted, 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='ann@contacts-test.example'")).rows[0].n, 0);
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete', { source: 'growth', id: 'dee@contacts-test.example' }, w)).body.deleted, 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM growth_free_checks WHERE email='dee@contacts-test.example'")).rows[0].n, 0, 'both checks gone');
      // Delete a selection: only with the typed confirmation, and only that country.
      assert.equal((await req('POST', '/api/free-growth/admin/contacts/delete-all', { source: 'rank', country: 'NL' }, w)).status, 400);
      const del = (await req('POST', '/api/free-growth/admin/contacts/delete-all', { source: 'rank', country: 'NL', confirm: 'DELETE' }, w)).body;
      assert.ok(del.deleted >= 1);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='cas@contacts-test.example'")).rows[0].n, 0);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email='bob@contacts-test.example'")).rows[0].n, 1, 'another country is kept');
      // The owner page renders the section and its script compiles.
      const page = await req('GET', '/free-growth/admin', null, jar);
      assert.match(page.body, /Contacts per country/);
      for (const m of page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(m[1]);
    } finally { srv.close(); }
  } finally {
    await pool.query("DELETE FROM rank_free_accounts WHERE email LIKE '%@contacts-test.example'").catch(() => {});
    await pool.query("DELETE FROM growth_free_checks WHERE email LIKE '%@contacts-test.example'").catch(() => {});
    await pool.end();
  }
});


test('research history: owner-only explicit bulk removal, active checks and rank accounts protected', { skip, timeout: 60000 }, async () => {
  const pool = new pg.Pool({ connectionString: DB });
  const express = require('express'), crypto = require('node:crypto');
  const { registerFreeGrowth, freeGrowthConfig } = require('../src/growth-free/routes.cjs');
  const growth = require('../src/growth-free/store.cjs'), rank = require('../src/rank-free/store.cjs').pgStore(pool);
  const suffix = crypto.randomBytes(8).toString('hex'), email = suffix+'@research-test.example', host = suffix+'.example';
  let srv, browser;
  try {
    await growth.ensureTables(pool);
    await rank.findAccountByEmail(email);
    await rank.upsertSignup({email,lang:'en',ipHash:'h',consent:false,verifyHash:'v-'+suffix,host,gl:'us',hl:'en',keywords:['roof repair']});
    const add = async (status, query) => (await pool.query("INSERT INTO growth_free_checks(public_id,access_key,email,url,host,query,status) VALUES($1,'key',$2,$3,$4,$5,$6) RETURNING id::text", [crypto.randomBytes(16).toString('hex'),email,'https://'+host+'/',host,query,status])).rows[0].id;
    const done = await add('DONE','first'), failed = await add('FAILED','second'), running = await add('RUNNING','active'), other = await add('DONE','keep');
    const app = express(); app.use(express.json());
    registerFreeGrowth(app,pool,{config:{...freeGrowthConfig({}),adminKey:'research-secret-0123456789'}});
    srv = app.listen(0); const base = 'http://127.0.0.1:'+srv.address().port, endpoint = '/api/free-growth/admin/research-history';
    const call = async (method, path, body, headers = {}) => fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
    assert.equal((await call('GET',endpoint)).status,404);
    const login = await call('POST','/api/free-growth/admin/login',{key:'research-secret-0123456789'});
    const cookie = login.headers.get('set-cookie').split(';')[0], jar={cookie}, write={cookie,'X-Requested-With':'growth-free-admin'};
    const inv=await growth.createInvite(pool,{label:'Cleanup regression '+suffix,maxChecks:3,days:7});
    try{
      const invitePath='/api/free-growth/admin/invites/'+inv.id;
      await pool.query('UPDATE growth_free_checks SET invite_id=$2 WHERE id=$1',[done,inv.id]);
      assert.equal((await call('POST',invitePath+'/delete',{confirm:'DELETE'},jar)).status,404);
      assert.equal((await call('POST',invitePath+'/delete',{confirm:'DELETE'},write)).status,409);
      assert.equal((await call('POST',invitePath+'/revoke',{},write)).status,200);
      assert.equal((await call('POST',invitePath+'/delete',{},write)).status,400);
      assert.equal((await call('POST',invitePath+'/delete',{confirm:'DELETE'},write)).status,200);
      assert.equal(await growth.getInvite(pool,inv.token),null);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM growth_free_checks WHERE id=$1',[done])).rows[0].n,1);
    }finally{await pool.query('DELETE FROM growth_free_invites WHERE id=$1',[inv.id]);}

    assert.equal((await call('POST',endpoint+'/delete',{ids:[done],confirm:'DELETE'},jar)).status,404);
    assert.equal((await call('POST',endpoint+'/delete',{ids:[done]},write)).status,400);
    assert.equal((await call('POST',endpoint+'/delete',{ids:['1 OR 1=1'],confirm:'DELETE'},write)).status,400);
    const list = await (await call('GET',endpoint,null,jar)).json();
    assert.equal(list.rows.filter(r=>r.email===email).length,4);
    assert.ok(list.rows.filter(r=>r.email===email).every(r=>r.result_url && !('access_key' in r)));
    const hire=(await pool.query("INSERT INTO growth_free_hire_requests(check_id,name,email,message) VALUES($1,'Test request',$2,'Test message') RETURNING id::text",[done,email])).rows[0].id;
    const hirePath='/api/free-growth/admin/hire-requests';
    assert.equal((await call('GET',hirePath)).status,404);
    const hires=await (await call('GET',hirePath,null,jar)).json();
    assert.ok(hires.rows.some(r=>r.id===hire&&r.status==='NEW'));
    assert.equal((await call('POST',hirePath+'/status',{id:hire,status:'COMPLETED'},jar)).status,404);
    assert.equal((await call('POST',hirePath+'/status',{id:hire,status:'INVALID'},write)).status,400);
    const rankOverview=await (await call('GET','/api/free-growth/admin/email-overview?source=rank',null,jar)).json();
    assert.ok(rankOverview.rows.some(r=>r.email===email&&r.status==='Unconfirmed'));
    const signupPath='/api/free-growth/admin/rank-signups';
    const signup=rankOverview.rows.find(r=>r.email===email);
    assert.equal(signup.is_new,true);
    const beforeSeen=await (await call('GET',signupPath,null,jar)).json();
    assert.ok(beforeSeen.unseen>=1);
    assert.equal((await call('POST',signupPath+'/seen',{ids:[signup.id]},jar)).status,404);
    const ack=await (await call('POST',signupPath+'/seen',{ids:[signup.id]},write)).json();
    assert.equal(ack.seen,1);
    const updatedRank=await (await call('GET','/api/free-growth/admin/email-overview?source=rank',null,jar)).json();
    assert.equal(updatedRank.rows.find(r=>r.id===signup.id).is_new,false);
    assert.equal(updatedRank.rows.find(r=>r.id===signup.id).status,'Unconfirmed');
    const afterSeen=await (await call('GET',signupPath,null,jar)).json();
    assert.equal(afterSeen.unseen,beforeSeen.unseen-1);

    await pool.query("UPDATE growth_free_checks SET published_on=CURRENT_DATE,reminder_due_at=NOW()+INTERVAL '28 days' WHERE id=$1",[other]);
    const growthOverview=await (await call('GET','/api/free-growth/admin/email-overview?source=growth',null,jar)).json();
    assert.ok(growthOverview.rows.some(r=>r.email===email&&r.status==='Scheduled'));
    const { chromium } = require('playwright');
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/free-growth/admin');
    await page.locator('#lf input[name=key]').fill('research-secret-0123456789');
    await page.locator('#lf button').click();
    await page.locator('#hireIndicator').waitFor({state:'visible'});
    await page.locator('#hireSection > summary').click();
    await page.locator('select[data-hire-id="'+hire+'"]').selectOption('COMPLETED');
    await page.waitForFunction(()=>document.getElementById('hireStatus').textContent==='Saved');
    const completed=await (await call('GET',hirePath,null,jar)).json();
    assert.ok(completed.rows.some(r=>r.id===hire&&r.status==='COMPLETED'));
    assert.equal(completed.active,hires.active-1);
    await page.locator('#hireSection > summary').click();
    await page.locator('#researchSection > summary').click();
    await page.locator('#rhSearch').fill(host);
    const group=page.locator('#rhRows details'); await group.waitFor();
    assert.equal(await group.count(),1);
    assert.equal(await group.evaluate(e=>e.open),false);
    await group.locator('summary').click();
    assert.equal(await group.locator('input[data-rh-id]').count(),4);
    assert.equal(await group.locator('input[data-rh-select-group]').count(),1);
    assert.equal(await group.locator('input[data-rh-id]:disabled').count(),1);
    await page.locator('#rhCollapse').click();
    assert.equal(await group.evaluate(e=>e.open),false);
    await group.locator('input[data-rh-select-group]').check();
    assert.match(await page.locator('#rhCount').textContent(),/3 selected/);
    await page.locator('#rhExpand').click();
    assert.equal(await group.evaluate(e=>e.open),true);
    assert.equal(await group.locator('input[data-rh-id]:checked').count(),3);
    await group.locator('input[data-rh-select-group]').uncheck();
    assert.match(await page.locator('#rhCount').textContent(),/0 selected/);
    await page.locator('#rhFilterSelect').click();
    assert.match(await page.locator('#rhCount').textContent(),/3 selected/);
    await page.locator('#rhClear').click();
    await group.locator('input[data-rh-id="'+done+'"]').check();
    await group.locator('input[data-rh-id="'+failed+'"]').check();
    page.once('dialog',d=>d.accept());
    await page.locator('#rhDelete').click();
    await page.waitForFunction(()=>document.getElementById('rhMessage')?.textContent.includes('Deleted 2 of 2'));
    assert.deepEqual(errors,[]);
    const del = await (await call('POST',endpoint+'/delete',{ids:[running,done],confirm:'DELETE'},write)).json();
    assert.equal(del.deleted,0);
    const remaining=(await pool.query('SELECT id::text FROM growth_free_checks WHERE email=$1 ORDER BY id',[email])).rows.map(r=>r.id);
    assert.deepEqual(remaining,[running,other]);
    await pool.query("UPDATE growth_free_checks SET status='DONE' WHERE id=$1",[running]);
    const finalRemoval=await (await call('POST',endpoint+'/delete',{ids:[running,other],confirm:'DELETE'},write)).json();
    assert.equal(finalRemoval.deleted,2);
    const contacts=await (await call('GET','/api/free-growth/admin/contacts?source=growth',null,jar)).json();
    const retained=contacts.rows.find(r=>r.email===email);
    assert.ok(retained,'contact remains after the last research is removed');
    assert.equal(retained.checks,0);
    assert.equal(retained.url,'https://'+host+'/');
    const erased=await (await call('POST','/api/free-growth/admin/contacts/delete',{source:'growth',id:email},write)).json();
    assert.equal(erased.deleted,1);
    const after=await (await call('GET','/api/free-growth/admin/contacts?source=growth',null,jar)).json();
    assert.ok(!after.rows.some(r=>r.email===email),'explicit contact removal clears retained metadata');

    assert.equal((await pool.query('SELECT COUNT(*)::int n FROM rank_free_accounts WHERE email=$1',[email])).rows[0].n,1);
  } finally {
    if(browser) await browser.close(); if(srv) srv.close();
    await pool.query('DELETE FROM growth_free_hire_requests WHERE email=$1',[email]).catch(()=>{});
    await pool.query('DELETE FROM growth_free_retained_contacts WHERE email=$1',[email]).catch(()=>{});
    await pool.query('DELETE FROM growth_free_checks WHERE email=$1',[email]).catch(()=>{});
    await pool.query('DELETE FROM growth_free_rank_signup_seen WHERE account_id IN (SELECT id FROM rank_free_accounts WHERE email=$1)',[email]).catch(()=>{});
    await pool.query('DELETE FROM rank_free_accounts WHERE email=$1',[email]).catch(()=>{});
    await pool.end();
  }
});
