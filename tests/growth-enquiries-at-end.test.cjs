'use strict';
// Owner 2026-11-02: the enquiry numbers are entered at the end of the test period from the reminder e-mail, not on the
// CMS page right after saving (that page gets closed).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('the CMS page asks for no enquiries after saving; it says when the e-mail comes',()=>{
 const html=fs.readFileSync(require.resolve('../public/growth-cms-neutral-handoff.html'),'utf8'),js=fs.readFileSync(require.resolve('../public/growth-cms-neutral-handoff.js'),'utf8');
 assert.doesNotMatch(html,/enquiryWrap|enquiriesBefore/);assert.doesNotMatch(js,/showEnquiryForm/);
 assert.match(html,/e-mails you a link to enter your enquiries for both periods/);
});
test('the measurement page opens the enquiry form of the publication named in the link',()=>{
 const m=require('../src/tracker-growth-measurement.cjs'),routes={};
 m.registerGrowthMeasurement({get(p,f){routes[p]=f},post(){}},{query:async()=>({rows:[]})});
 const res={set(){return this},type(){return this},send(h){this.h=h}};routes['/track/:token/growth/measurement']({params:{token:'t'}},res);
 assert.match(res.h,/<section id="publication-'\+Number\(p\.publication_id\)\+'">/);
 assert.match(res.h,/function openFromLink\(\)/);assert.match(res.h,/openFromLink\(\);/);
});
