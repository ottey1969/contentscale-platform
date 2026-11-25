'use strict';
// Owner 2026-11-19: Search Console stays optional, but the visitor can say at the start that there is none, so the
// result does not ask for it again.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');

test('the start form has a "no Search Console" tick in step 4 and sends it only without an export',()=>{
 assert.match(src,/<input type="checkbox" id="noGsc" name="no_gsc">/);
 assert.match(src,/no_gsc:!gf&&!!\(document\.getElementById\('noGsc'\)\|\|\{\}\)\.checked,/);
 assert.match(src,/gscDeclined:b\.no_gsc===true&&!gsc,/);
 const {FORM_TEXTS}=(()=>{try{return require('../src/growth-free/form-texts.cjs')}catch(e){return {}}})();
 const ft=require('../src/growth-free/form-texts.cjs');
 const all=JSON.stringify(ft);
 for(const t of ['I have no Search Console data for this page','Ik heb geen Search Console-gegevens voor deze pagina','No tengo datos de Search Console para esta página'])assert.ok(all.includes(t),t);
 for(const [lang,evidence,optional] of [
  ['en','Add real AI answers and their sources','Sitemap and Search Console exports are optional.'],
  ['nl','Voeg echte AI-antwoorden en hun bronnen toe','Sitemap en Search Console-export zijn optioneel.'],
  ['es','Añade respuestas reales de IA y sus fuentes','El sitemap y la exportación de Search Console son opcionales.']
 ]) {
  const hint=ft.FORM_TEXTS[lang].simpleOptionalHint;
  assert.ok(hint.includes(evidence),lang+': step 4 requests real evidence');
  assert.ok(hint.includes(optional),lang+': step 4 explains Search Console remains optional');
 }
});

test('the choice is stored with the check',async()=>{
 delete require.cache[require.resolve('../src/growth-free/store.cjs')];
 const store=require('../src/growth-free/store.cjs'),seen=[];
 const pool={query:async(sql,args)=>{seen.push([String(sql),args]);if(/INSERT INTO growth_free_checks/.test(sql))return {rows:[{id:7,public_id:'p',access_key:'k',status:'QUEUED'}]};return {rows:[]}}};
 const row=await store.createCheck(pool,{email:'a@example.com',ipHash:null,url:'https://example.com/',host:'example.com',query:'q',marketingConsent:false,cached:null,gscDeclined:true});
 assert.equal(row.gsc_declined,true);
 assert.ok(seen.some(([s,a])=>/UPDATE growth_free_checks SET gsc_declined=TRUE WHERE id=\$1/.test(s)&&a[0]===7));
 seen.length=0;
 await store.createCheck(pool,{email:'a@example.com',ipHash:null,url:'https://example.com/',host:'example.com',query:'q',marketingConsent:false,cached:null});
 assert.ok(!seen.some(([s])=>/gsc_declined/.test(s)),'not set without the tick');
});

test('the result says the visitor has none, instead of asking for an export',()=>{
 const start=src.indexOf('function gscHtml(g,declined){'),end=src.indexOf('function wireGsc(){');
 const ctx={esc:t=>String(t==null?'':t)};vm.runInNewContext(src.slice(start,end),ctx);
 const declined=ctx.gscHtml({uploads:0,latest:null},true);
 assert.match(declined,/You indicated at the start that this page has no Search Console data/);
 assert.doesNotMatch(declined,/No Search Console export uploaded/);
 assert.match(ctx.gscHtml({uploads:0,latest:null},false),/No Search Console export uploaded/);
 assert.match(src,/gsc_declined:!!row\.gsc_declined&&!\(gscPart&&gscPart\.latest\),/);
 assert.match(src,/gscHtml\(d\.gsc,d\.gsc_declined\)/);
});

test('the AI-answers line has no second link next to the AI research bar (owner 2026-11-19)',()=>{
 assert.doesNotMatch(src,/<a href="#freeAiResearch">Open AI research<\/a><\/li>/);
});
