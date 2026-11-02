'use strict';
// Reminder e-mail after a published change (owner 2026-11-02). Addresses are examples (labelled); no e-mail is sent.
const test=require('node:test'),assert=require('node:assert/strict');
const {parseEmails,dueAt,windowsOf,message,startReminderLoop}=require('../src/growth-measurement-reminders.cjs');
test('addresses: valid ones kept (max 5), wrong ones named',()=>{
 assert.deepEqual(parseEmails('Owner@Example.com; editor@agency.example  owner@example.com'),{emails:['owner@example.com','editor@agency.example'],invalid:[],too_many:false});
 assert.deepEqual(parseEmails('owner@example.com, nope').invalid,['nope']);
 assert.equal(parseEmails('a@x.io,b@x.io,c@x.io,d@x.io,e@x.io,f@x.io').too_many,true);
});
test('due when both 28-day periods are final in Search Console: publication date + 32 days, 08:00 UTC',()=>{
 assert.equal(dueAt('2026-11-02T01:43:00Z').toISOString(),'2026-12-04T08:00:00.000Z');
 assert.deepEqual(windowsOf('2026-11-02T01:43:00Z'),{before:{start:'2026-10-05',end:'2026-11-01'},after:{start:'2026-11-03',end:'2026-11-30'}});
});
test('the reminder e-mail is plain: what we did, what we measured, one question, no promise',()=>{
 const base={url:'https://contentscale.site/content-scaling/',query:'content scaling',publishedAt:'2026-11-02T01:43:00Z',link:null,notes:'Added four sections.'};
 const auto=message({...base,gsc:{status:'IMPORTED',periods:[{period:'before',clicks:12,impressions:900},{period:'after',clicks:19,impressions:1010}]},leads:{before:3}});
 assert.match(auto.subject,/4 weeks after the update of contentscale\.site\/content-scaling: the results and one question/);
 const text=auto.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 assert.match(text,/On 2 November 2026 new content was published on your page contentscale\.site\/content-scaling \. What changed: Added four sections\./);
 assert.match(text,/Times your page was shown 900 1010 Times someone clicked to your page 12 19 That is 7 clicks more than before/);
 assert.match(text,/not proof that the update caused it/);assert.match(text,/More visitors or more customers are not guaranteed/);
 assert.match(text,/in the 4 weeks after \(3 November – 30 November\)/);assert.doesNotMatch(text,/in the 4 weeks before \(/,'the before count was already given');
 assert.doesNotMatch(text,/impression|Search Console numbers for/i,'no jargon in the reader text except the source name');
 const none=message({...base,gsc:{status:'NO_GSC_ACCESS'},leads:{}});
 assert.match(none.html,/Growth has no access to Google Search Console for this website yet/);
 assert.match(message({...base,gsc:{status:'NO_ROW'}}).html,/We do not fill in a zero ourselves/);
 assert.doesNotMatch(none.html,/href=/);
 assert.match(message({...base,gsc:{status:'NO_GSC_ACCESS'},leads:{before:1,after:2}}).subject,/: the results$/);
});
test('no reminder loop without an e-mail key',()=>{
 const key=process.env.BREVO_API_KEY;delete process.env.BREVO_API_KEY;
 assert.equal(startReminderLoop({query:async()=>({rows:[]})}),null);
 if(key)process.env.BREVO_API_KEY=key;
});

// Owner 2026-11-02: "it does not work" — nothing arrived after setting the reminder. A confirmation is sent at once,
// and the page is told honestly when e-mail is not configured. Addresses as the owner typed them; no e-mail is sent.
test('a confirmation is sent when the reminder is set; without an e-mail key the page is told so',async()=>{
 const {sendConfirmation}=require('../src/growth-measurement-reminders.cjs');
 const sent=[];const send=async m=>{sent.push(m);return true};
 const emails=['ottmar.francisca1969@gmail.com','otteyfrancisca@gmail.com'];
 assert.equal((await sendConfirmation({emails,url:'https://contentscale.site/content-scaling/',publishedAt:'2026-11-02T01:43:00Z',send,model:null})).sent,true);
 assert.deepEqual(sent[0].to,emails);assert.match(sent[0].subject,/Your page update is live — we will show you the results on 4 December 2026/);
 assert.match(sent[0].html,/You do not need to do anything/);assert.match(sent[0].html,/the 4 weeks before the update \(5 October – 1 November\) compared with the 4 weeks after \(3 November – 30 November\)/);assert.doesNotMatch(sent[0].html,/href=|\/track\//,'no owner link in a confirmation');
 const key=process.env.BREVO_API_KEY;delete process.env.BREVO_API_KEY;
 assert.deepEqual(await sendConfirmation({emails,url:'https://contentscale.site/x/',publishedAt:'2026-11-02T01:43:00Z'}),{sent:false,reason:'EMAIL_NOT_CONFIGURED'});
 if(key)process.env.BREVO_API_KEY=key;
 assert.deepEqual(await sendConfirmation({emails,url:'u',publishedAt:'2026-11-02T01:43:00Z',send:async()=>false}),{sent:false,reason:'NOT_ACCEPTED'});
});
