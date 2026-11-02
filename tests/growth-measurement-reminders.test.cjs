'use strict';
// Reminder e-mail after a published change (owner 2026-11-02). Addresses are examples (labelled); no e-mail is sent.
const test=require('node:test'),assert=require('node:assert/strict');
const {parseEmails,dueAt,windowsOf,message,startReminderLoop}=require('../src/growth-measurement-reminders.cjs');
test('addresses: valid ones kept (max 5), wrong ones named',()=>{
 assert.deepEqual(parseEmails('Owner@Example.com; editor@agency.example  owner@example.com'),{emails:['owner@example.com','editor@agency.example'],invalid:[],too_many:false});
 assert.deepEqual(parseEmails('owner@example.com, nope').invalid,['nope']);
 assert.equal(parseEmails('a@x.io,b@x.io,c@x.io,d@x.io,e@x.io,f@x.io').too_many,true);
});
test('due when both 28-day periods can be measured: publication date + 31 days, 08:00 UTC',()=>{
 assert.equal(dueAt('2026-11-02T01:43:00Z').toISOString(),'2026-12-03T08:00:00.000Z');
 assert.deepEqual(windowsOf('2026-11-02T01:43:00Z'),{before:{start:'2026-10-05',end:'2026-11-01'},after:{start:'2026-11-03',end:'2026-11-30'}});
});
test('the message asks for numbers and never reports a result; the link only when given',()=>{
 const m=message({url:'https://contentscale.site/content-scaling/',query:'content scaling',publishedAt:'2026-11-02T01:43:00Z',link:null});
 assert.match(m.subject,/28 days after your change on contentscale\.site\/content-scaling\//);
 assert.match(m.html,/2026-10-05 to 2026-11-01 \(before\) and 2026-11-03 to 2026-11-30 \(after\)/);
 assert.match(m.html,/does not estimate enquiries or prove/);assert.doesNotMatch(m.html,/href=/);
});
test('no reminder loop without an e-mail key',()=>{
 const key=process.env.BREVO_API_KEY;delete process.env.BREVO_API_KEY;
 assert.equal(startReminderLoop({query:async()=>({rows:[]})}),null);
 if(key)process.env.BREVO_API_KEY=key;
});
