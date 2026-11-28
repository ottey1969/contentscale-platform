'use strict';
// Owner 2026-11-28: "bij elk bedrijf dat gescand is een popup: you scored higher than 70, want to add yourself to the
// leaderboard? Add your e-mail and confirm." No listing without the company's own consent: the visitor gives an e-mail,
// confirms it by a link, and only then the entry reaches Admin → Pending for the owner's approval.
// The score is taken from the server's own scan log, never from the browser.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const request=require('supertest');

const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const disposable=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);

async function setup(){
 const {Pool}=require('pg');
 const schema='lb_confirm_'+crypto.randomBytes(6).toString('hex');
 const admin=new Pool({connectionString:DB});
 await admin.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:DB,options:'-c search_path='+schema});
 await pool.query(`CREATE TABLE leaderboard (id SERIAL PRIMARY KEY, url TEXT NOT NULL UNIQUE, company_name VARCHAR(255), score INTEGER NOT NULL,
  country VARCHAR(100) DEFAULT 'NL', is_verified BOOLEAN DEFAULT FALSE, is_opted_out BOOLEAN DEFAULT FALSE, submission_ip VARCHAR(50),
  admin_verified BOOLEAN DEFAULT TRUE, niche VARCHAR(100), business_type VARCHAR(100), page_count INTEGER DEFAULT 1, page_scores JSONB DEFAULT '[]',
  scan_source VARCHAR(50) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW())`);
 await pool.query(`CREATE TABLE scan_log (id SERIAL PRIMARY KEY, business_url TEXT, score INTEGER, source VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())`);
 const mails=[];
 const {registerLeaderboardConfirm,ready}=require('../src/leaderboard-confirm.cjs');
 const app=express();app.set('trust proxy',true);app.use(express.json());
 registerLeaderboardConfirm(app,pool,{sendMail:async m=>{mails.push(m);return true},secret:'lb-test'});
 await ready(pool);
 return {app,pool,mails,done:async()=>{await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}};
}
const linkOf=mail=>new URL(mail.html.match(/href="([^"]*\/leaderboard\/confirm\?[^"]*)"/)[1].replace(/&amp;/g,'&'));

test('page: e-mail + consent → confirmation mail → confirmed → visible in Pending; the score comes from the scan log',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const s=await setup();
 try{
  const url='https://acme-roofing.example/roof-repair/';
  await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ($1,82,'single')",[url]);
  const post=b=>request(s.app).post('/api/leaderboard/request').set('X-Forwarded-For','198.51.100.7').send({kind:'page',url,company_name:'Acme Roofing',email:'info@acme-roofing.example',consent:true,lang:'nl',...b});
  assert.equal((await post({consent:false})).status,400,'consent is required');
  assert.equal((await post({email:'not-an-email'})).status,400);
  const ok=await post({score:100});
  assert.equal(ok.status,200,JSON.stringify(ok.body));
  assert.equal(s.mails.length,1);
  assert.equal(s.mails[0].to,'info@acme-roofing.example');
  assert.match(s.mails[0].subject,/Bevestig/);
  assert.ok(s.mails[0].html.includes(require('../src/leaderboard-confirm.cjs').CONSENT.nl),'the consent text is in the e-mail');
  assert.match(s.mails[0].html,/Met je bevestiging ga je akkoord met/);
  assert.ok(s.mails[0].html.includes(require('../src/leaderboard-confirm.cjs').NO_PROMO.nl),'the e-mail says it is never used for promotion');
  let row=(await s.pool.query('SELECT * FROM leaderboard WHERE url=$1',[url])).rows[0];
  assert.equal(row.score,82,'the browser cannot set the score');
  assert.equal(row.admin_verified,false);assert.equal(row.email_confirmed_at,null);
  assert.equal(row.email_domain_match,true);assert.equal(row.score_source,'scan_log');
  // Proof of who agreed to what: the e-mail, the exact consent text, when it was given and (below) when it was confirmed.
  assert.equal(row.contact_email,'info@acme-roofing.example');assert.ok(row.consent_at);
  assert.equal(row.consent_text,require('../src/leaderboard-confirm.cjs').CONSENT.nl);assert.ok(row.request_ip_hash&&!/198\.51/.test(row.request_ip_hash));
  assert.ok(!JSON.stringify(row).includes(linkOf(s.mails[0]).searchParams.get('t')),'only a hash of the token is stored');
  // Not confirmed: not in Pending.
  const pending=require('../src/leaderboard-confirm.cjs').PENDING_SQL;
  assert.equal((await s.pool.query(pending)).rows.length,0);
  const link=linkOf(s.mails[0]);
  assert.equal(link.pathname,'/leaderboard/confirm');
  const page=await request(s.app).get(link.pathname+link.search).expect(200);
  assert.match(page.text,/bevestigd/i);
  row=(await s.pool.query('SELECT * FROM leaderboard WHERE url=$1',[url])).rows[0];
  assert.ok(row.email_confirmed_at);assert.equal(row.admin_verified,false,'the owner still approves');
  assert.equal((await s.pool.query(pending)).rows[0].url,url);
  // The link works once.
  assert.match((await request(s.app).get(link.pathname+link.search).expect(200)).text,/ongeldig|verlopen/i);
 }finally{await s.done()}
});

test('no scan, a score under 70, an old scan or another site\'s mail: refused or flagged; limits per IP',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const s=await setup();
 try{
  const body=(url,extra={})=>({kind:'page',url,company_name:'X',email:'owner@other-company.example',consent:true,lang:'en',...extra});
  const r1=await request(s.app).post('/api/leaderboard/request').send(body('https://never-scanned.example/'));
  assert.equal(r1.status,409);assert.equal(r1.body.code,'SCAN_FIRST');
  await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ('https://low.example/',64,'single'),('https://old.example/',90,'single')");
  await s.pool.query("UPDATE scan_log SET created_at=NOW()-INTERVAL '7 hours' WHERE business_url='https://old.example/'");
  assert.equal((await request(s.app).post('/api/leaderboard/request').send(body('https://low.example/'))).body.code,'BELOW_70');
  assert.equal((await request(s.app).post('/api/leaderboard/request').send(body('https://old.example/'))).body.code,'SCAN_FIRST');
  // Another company's e-mail: allowed, but the owner sees it is not on the site's domain.
  await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ('https://good.example/',77,'single')");
  await request(s.app).post('/api/leaderboard/request').send(body('https://good.example/')).expect(200);
  assert.equal((await s.pool.query("SELECT email_domain_match FROM leaderboard WHERE url='https://good.example/'")).rows[0].email_domain_match,false);
  // An approved entry is never pulled back to pending by a new request.
  await s.pool.query("INSERT INTO leaderboard (url,company_name,score,admin_verified,is_verified) VALUES ('https://listed.example/','Listed',88,TRUE,TRUE)");
  await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ('https://listed.example/',75,'single')");
  const listed=await request(s.app).post('/api/leaderboard/request').send(body('https://listed.example/'));
  assert.equal(listed.body.already_listed,true);
  assert.equal((await s.pool.query("SELECT admin_verified,score FROM leaderboard WHERE url='https://listed.example/'")).rows[0].admin_verified,true);
  // At most five confirmation mails per connection per day.
  for(let i=0;i<6;i++)await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ($1,80,'single')",['https://many'+i+'.example/']);
  const codes=[];
  for(let i=0;i<6;i++)codes.push((await request(s.app).post('/api/leaderboard/request').set('X-Forwarded-For','203.0.113.9').send(body('https://many'+i+'.example/',{email:'a'+i+'@many'+i+'.example'}))).status);
  assert.deepEqual(codes,[200,200,200,200,200,429]);
 }finally{await s.done()}
});

test('sitemap: the average comes from the scan log of those pages; the entry is the domain',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const s=await setup();
 try{
  const pages=['https://site.example/','https://site.example/a/','https://site.example/b/'];
  await s.pool.query("INSERT INTO scan_log (business_url,score,source) VALUES ($1,90,'bulk'),($2,70,'bulk'),($3,80,'bulk')",pages);
  const r=await request(s.app).post('/api/leaderboard/request').send({kind:'site',url:'https://site.example/',page_urls:[...pages,'https://elsewhere.example/'],
   company_name:'Site',email:'hello@site.example',consent:true,lang:'es',avg_score:99,country:'ES',niche:'seo'});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const row=(await s.pool.query("SELECT * FROM leaderboard WHERE url='https://site.example'")).rows[0];
  assert.equal(row.score,80);assert.equal(row.page_count,3);assert.equal(row.scan_source,'sitemap');assert.equal(row.country,'ES');
  assert.match(s.mails[0].subject,/Confirma/);
 }finally{await s.done()}
});

test('the old open submit endpoints no longer list anyone without a confirmed e-mail',()=>{
 const src=require('node:fs').readFileSync(require.resolve('../src/index.js'),'utf8');
 assert.match(src,/app\.post\('\/api\/leaderboard\/submit', async \(req, res\) => \{\s*return res\.status\(410\)/);
 assert.match(src,/app\.post\('\/api\/sitemap\/submit', async \(req, res\) => \{[\s\S]{0,600}if \(!autoApprove\) return res\.status\(410\)/);
 assert.match(src,/registerLeaderboardConfirm\(app, pool/);
 assert.match(src,/require\('\.\/leaderboard-confirm\.cjs'\)\.PENDING_SQL/);
 // The admin page script still parses (Pending shows the e-mail, the confirmation and the consent).
 const k='const _ADMIN_DASHBOARD_HTML = `',st=src.indexOf(k),en=src.indexOf('`;',st);
 const html=new Function('return `'+src.slice(st+k.length,en)+'`')();
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(m[1]));
 assert.match(html,/e-mail confirmed/);assert.match(html,/Consent given/);
});
