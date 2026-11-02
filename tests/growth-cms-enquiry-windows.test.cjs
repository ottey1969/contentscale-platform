'use strict';
// Owner 2026-11-02: the enquiry input after recording a publication. The CMS page computes the 28-day windows itself;
// they must be exactly the server's (otherwise the server refuses the number). Publication time as in the owner's screen.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {windowDates}=require('../src/tracker-growth-measurement.cjs');
const js=fs.readFileSync(require.resolve('../public/growth-cms-neutral-handoff.js'),'utf8');
const windowsOf=new Function('return '+js.match(/function windowsOf\(at\)\{[\s\S]*?after:\{[^}]*\}\}\}/)[0])();
test('the page and the server use the same before/after windows',()=>{
 for(const iso of ['2026-11-02T01:43:00Z','2026-11-02T23:59:00Z','2026-03-29T00:30:00Z'])
  assert.deepEqual(windowsOf(new Date(iso)),windowDates(iso),iso);
});
test('the enquiry form appears after the publication is recorded and posts the "before" period',()=>{
 assert.match(js,/showEnquiryForm\(safe\.publicationId,at\)/);
 assert.match(js,/period:'before',start_date:w\.before\.start,end_date:w\.before\.end/);
 assert.match(js,/Growth does not estimate this number/);
});
