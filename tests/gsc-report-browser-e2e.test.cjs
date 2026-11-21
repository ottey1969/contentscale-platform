'use strict';
// The owner's whole path in a real browser against PostgreSQL: sign in, upload exports and a hand-added page, make the
// report, open the private link as the company (no login, no script errors, readable on a phone), withdraw it.
const test=require('node:test'),assert=require('node:assert/strict');
const zlib=require('node:zlib'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let pg=null,chromium=null;try{pg=require('pg')}catch(e){}try{({chromium}=require('playwright'))}catch(e){}
const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const local=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
function zip(files){const parts=[],central=[];let off=0;for(const [n,t] of Object.entries(files)){const d=Buffer.from(t),nb=Buffer.from(n),crc=zlib.crc32(d);
 const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt32LE(crc,14);l.writeUInt32LE(d.length,18);l.writeUInt32LE(d.length,22);l.writeUInt16LE(nb.length,26);parts.push(l,nb,d);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(d.length,20);c.writeUInt32LE(d.length,24);c.writeUInt16LE(nb.length,28);c.writeUInt32LE(off,42);central.push(c,nb);off+=30+nb.length+d.length}
 const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(Object.keys(files).length,8);e.writeUInt16LE(Object.keys(files).length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);return Buffer.concat([...parts,cd,e])}
const S='https://acme-roofing.example';
test('owner makes a report in the browser and the company opens the private link',{skip:!(local&&pg&&chromium)?'PostgreSQL or Playwright not available':false,timeout:120000},async()=>{
 const express=require('express');const {registerFreeGrowth,freeGrowthConfig}=require('../src/growth-free/routes.cjs');const {registerGscReport}=require('../src/gsc-report/routes.cjs');
 const pool=new pg.Pool({connectionString:DB});const KEY='owner-admin-key-browser-0123456789';
 const config={...freeGrowthConfig({GROWTH_FREE_ADMIN_KEY:KEY,GROWTH_FREE_ACCESS_KEYS:'e2e-gsc-key-123'})};
 const app=express();app.use(express.json({limit:'10mb'}));
 registerFreeGrowth(app,pool,{config,sendEmail:async()=>{}});registerGscReport(app,pool,{config});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsc-e2e-'));
 fs.writeFileSync(path.join(dir,'site.zip'),zip({'Pages.csv':'Top pages,Clicks,Impressions,CTR,Position\n'+[[S+'/',300,3000,'10%',2.1],[S+'/roof-repair/',20,4000,'0.5%',6.2],[S+'/gutters/',40,800,'5%',5.5],
  [S+'/insulation/',25,700,'3.57%',7],[S+'/skylights/',0,900,'0%',8.4],[S+'/emergency/',30,1000,'3%',2.8],[S+'/contact/',15,100,'15%',3]].map(r=>r.join(',')).join('\n'),
  'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nacme roofing,250,900,27%,1.2\nroof repair near me,10,2500,0.4%,7.1\nhow much does a roof repair cost,2,800,0.25%,9.4',
  'Countries.csv':'Country,Clicks,Impressions,CTR,Position\nUnited States,400,9000,4%,5\nCanada,0,500,0%,7.8','Devices.csv':'Device,Clicks,Impressions,CTR,Position\nMobile,300,6000,5%,5\nDesktop,100,3800,2.6%,6',
  'Chart.csv':'Date,Clicks,Impressions,CTR,Position\n'+Array.from({length:14},(_,i)=>[new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),i<7?20:40,i<7?600:800,'x',5].join(',')).join('\n')}));
 fs.writeFileSync(path.join(dir,'roof.zip'),zip({'Queries.csv':'Top queries,Clicks,Impressions,CTR,Position\nroof repair near me,10,2500,0.4%,7.1','Filters.csv':'Filter,Value\nPage,'+S+'/roof-repair/'}));
 const browser=await chromium.launch();const ids=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900}}),page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/gsc');await page.fill('#ownerKey',KEY);await page.click('#lf button[type=submit]');
  await page.waitForSelector('#gscFiles');
  await page.fill('#title','Acme Roofing — Search Console');await page.selectOption('#lang','nl');
  await page.setInputFiles('#gscFiles',[path.join(dir,'site.zip'),path.join(dir,'roof.zip')]);
  await page.fill('#manual',S+'/new-service/ ;;;; Nieuwe dienst');await page.check('#growthOn');
  await page.click('#go');await page.waitForSelector('#made a.btn',{timeout:15000}).catch(async e=>{throw Error('status: '+await page.textContent('#st')+' | errors: '+errors.join(';'))});
  // Owner 2026-11-21 ("dan mis ik de animatie"): progress is shown while working and hidden after; the result is scrolled into view.
  assert.equal(await page.isHidden('#progress'),true);assert.equal(await page.textContent('#go'),'Make the report');
  await page.waitForFunction(()=>{const r=document.getElementById('made').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0},null,{timeout:5000});
  const href=await page.getAttribute('#made a.btn','href');assert.match(href,/^\/gsc\/r\//);
  // Owner 2026-11-20: reports with and without Search Console in two separate sections.
  await page.waitForSelector('#listWith table');assert.match(await page.textContent('#listWith'),/Acme Roofing/);assert.doesNotMatch(await page.textContent('#listWithout'),/Acme Roofing/);
  // The company: a fresh browser without the owner's session, on a phone.
  const phone=await browser.newContext({viewport:{width:390,height:844}}),p2=await phone.newPage();const e2=[];p2.on('pageerror',e=>e2.push(e.message));
  const resp=await p2.goto(base+href);assert.equal(resp.status(),200);
  const text=await p2.textContent('body');
  for(const s of ['Pagina’s om te bewerken, op volgorde','Snelle winst','Nieuwe dienst','Landen','Canada','vertoningen, geen klikken','roof repair near me'])assert.ok(text.includes(s),'shown: '+s);
  assert.ok(await p2.$('a[href^="/free-growth?invite="]'),'the company can research a page in Free Growth with the attached invitation');
  assert.equal(await p2.evaluate(()=>document.documentElement.scrollWidth),390,'no horizontal scroll on a phone');
  assert.deepEqual(errors.concat(e2),[]);
  // Withdraw: the link stops working.
  await page.once('dialog',d=>d.accept());await page.click('#listWith [data-revoke]');
  await page.waitForFunction(()=>/Withdrawn/.test(document.getElementById('listWith').textContent));
  assert.equal((await p2.goto(base+href)).status(),404);
  // Delete (owner 2026-11-20: "delete optie ... en bulk delete"): select, delete selected, confirm; the report is gone from the list and the database.
  await page.check('#listWith [data-id]');assert.equal(await page.isDisabled('#deleteSelected'),false);
  await page.once('dialog',d=>d.accept());await page.click('#deleteSelected');
  await page.waitForFunction(()=>!/Acme Roofing/.test(document.getElementById('listWith').textContent));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM gsc_reports WHERE title='Acme Roofing — Search Console'")).rows[0].n,0);
  assert.deepEqual(errors,[]);
  ids.push(...(await pool.query("SELECT id FROM gsc_reports WHERE title='Acme Roofing — Search Console'")).rows.map(r=>r.id));
 }finally{await browser.close();srv.close();if(ids.length)await pool.query('DELETE FROM gsc_reports WHERE id=ANY($1)',[ids]);await pool.end();fs.rmSync(dir,{recursive:true,force:true})}
});
