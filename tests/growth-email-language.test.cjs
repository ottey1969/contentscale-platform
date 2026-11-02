'use strict';
// Owner 2026-11-02: the e-mails follow the language of the page; "and if it is Turkish?". English and Dutch are written
// texts; other languages are translated by the model and checked; otherwise English. Model answers are stand-ins.
const test=require('node:test'),assert=require('node:assert/strict');
const {message,confirmationMessage,pageLanguage,localize,sendConfirmation}=require('../src/growth-measurement-reminders.cjs');
const base={url:'https://contentscale.site/content-scaling/',query:'content scaling',publishedAt:'2026-11-02T01:43:00Z',notes:'Four sections added.'};
const imported={status:'IMPORTED',periods:[{period:'before',clicks:12,impressions:900},{period:'after',clicks:19,impressions:1010}]};
test('the page language is read from the page',()=>{
 assert.equal(pageLanguage('<html lang="tr-TR"><body>'),'tr');assert.equal(pageLanguage('<html class="x" lang=nl>'),'nl');assert.equal(pageLanguage('',null),'en');
});
test('Dutch is a written text with Dutch dates',()=>{
 const m=message({...base,lang:'nl',link:'https://app.example/x',gsc:imported,leads:{}}),t=m.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 assert.match(m.subject,/4 weken na de aanpassing van contentscale\.site\/content-scaling: de resultaten en één vraag/);
 assert.match(t,/Op 2 november 2026 is nieuwe inhoud gepubliceerd/);assert.match(t,/Keren dat uw pagina werd getoond 900 1010 Keren dat iemand naar uw pagina klikte 12 19 Dat is 7 klikken meer dan ervoor/);
 assert.match(t,/Meer bezoekers of meer klanten zijn niet gegarandeerd/);assert.match(t,/Vul uw aanvragen in voor deze aanpassing/);
 assert.match(confirmationMessage({...base,emails:['a@b.co'],gscAvailable:false,lang:'nl'}).html,/Growth heeft nog geen toegang tot Google Search Console/);
});
test('Turkish: a checked translation is used; a translation that changes a number or link is refused and English is sent',async()=>{
 const en=message({...base,lang:'en',link:'https://app.example/x',gsc:imported,leads:{}});
 // Stand-in "translation": the same HTML with the visible words marked as translated, numbers and links untouched.
 const good={call:async()=>JSON.stringify({subject:'TR: '+en.subject,html:en.html.replace(/Times your page was shown/,'Sayfanızın gösterilme sayısı')})};
 const ok=await localize(en,'tr',{model:good});assert.equal(ok.language,'tr');assert.equal(ok.translation,'AI_CHECKED');assert.match(ok.html,/Sayfanızın gösterilme sayısı/);
 const changedNumber={call:async()=>JSON.stringify({subject:'TR',html:en.html.replace('>1010<','>1100<')})};
 const r1=await localize(en,'tr',{model:changedNumber});assert.equal(r1.language,'en');assert.equal(r1.translation,'REJECTED');assert.equal(r1.html,en.html);
 const changedLink={call:async()=>JSON.stringify({subject:'TR subject',html:en.html.replace('https://app.example/x','https://evil.example/')})};
 assert.equal((await localize(en,'tr',{model:changedLink})).translation,'REJECTED');
 assert.equal((await localize(en,'tr',{model:null})).translation,'NO_MODEL');
 assert.equal((await localize(en,'tr',{model:{call:async()=>'not json'}})).translation,'FAILED');
});
test('the confirmation goes out in the page language and says which language was used',async()=>{
 const sent=[];const send=async m=>{sent.push(m);return true};
 assert.deepEqual(await sendConfirmation({...base,emails:['a@b.co'],send,lang:'nl',model:null,gscAvailable:true}),{sent:true,language:'nl'});
 assert.match(sent[0].subject,/Uw pagina-aanpassing staat live/);
 const r=await sendConfirmation({...base,emails:['a@b.co'],send,lang:'tr',model:null,gscAvailable:true});
 assert.deepEqual(r,{sent:true,language:'en',translation:'NO_MODEL'});assert.match(sent[1].subject,/Your page update is live/);
});
