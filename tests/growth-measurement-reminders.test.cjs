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
test('the message says what was filled in automatically and asks only for what Growth cannot read',()=>{
 const base={url:'https://contentscale.site/content-scaling/',query:'content scaling',publishedAt:'2026-11-02T01:43:00Z',link:null};
 const auto=message({...base,gsc:{status:'IMPORTED',periods:[{period:'before',clicks:12,impressions:900},{period:'after',clicks:19,impressions:1010}]},leads:{before:3}});
 assert.match(auto.subject,/Search Console filled in, add your enquiries/);
 assert.match(auto.html,/Filled in automatically from Search Console[\s\S]*before 12 clicks, 900 impressions; after 19 clicks, 1010 impressions/);
 assert.match(auto.html,/not proof that the change caused it/);
 assert.match(auto.html,/enter the contact requests for this page after \(2026-11-03 to 2026-11-30\)/);assert.doesNotMatch(auto.html,/before \(2026-10-05/,'the before count was already entered');
 const none=message({...base,gsc:{status:'NO_GSC_ACCESS'},leads:{}});
 assert.match(none.html,/Growth has no Search Console access for this site/);assert.match(none.subject,/enter the numbers/);
 assert.match(message({...base,gsc:{status:'NO_ROW'}}).html,/Growth does not assume zero/);
 assert.doesNotMatch(none.html,/href=/);
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
 assert.deepEqual(await sendConfirmation({emails,url:'https://contentscale.site/content-scaling/',publishedAt:'2026-11-02T01:43:00Z',send}),{sent:true});
 assert.deepEqual(sent[0].to,emails);assert.match(sent[0].subject,/Growth reminder set for 2026-12-04/);
 assert.match(sent[0].html,/before \(2026-10-05 to 2026-11-01\) and after \(2026-11-03 to 2026-11-30\)/);assert.doesNotMatch(sent[0].html,/href=|\/track\//,'no owner link in a confirmation');
 const key=process.env.BREVO_API_KEY;delete process.env.BREVO_API_KEY;
 assert.deepEqual(await sendConfirmation({emails,url:'https://contentscale.site/x/',publishedAt:'2026-11-02T01:43:00Z'}),{sent:false,reason:'EMAIL_NOT_CONFIGURED'});
 if(key)process.env.BREVO_API_KEY=key;
 assert.deepEqual(await sendConfirmation({emails,url:'u',publishedAt:'2026-11-02T01:43:00Z',send:async()=>false}),{sent:false,reason:'NOT_ACCEPTED'});
});
