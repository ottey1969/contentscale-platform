'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
test('owner report shows concrete decision ahead of generic research',()=>{
 const result=ui.indexOf("section('Growth result · decision and evidence')");
 const research=ui.indexOf("section('Research context and next check')");
 assert(result>0&&research>result);
 assert.match(ui,/outcome\.decision==='IMPROVE_EXISTING'/);
 assert.match(ui,/outcome\.proposed_text/);
 assert.match(ui,/outcome\.existing_passage/);
 assert.match(ui,/outcome\.source_comparison/);
 assert.match(ui,/Copy proposed Growth edit/);
});
test('unverified claims and read-only exports never masquerade as publish-ready copy',()=>{
 assert.match(ui,/d\.access\?\.owner_report===true/);
 assert.match(ui,/outcome\.verified_gap===true/);
 assert.match(ui,/outcome\.decision==='DATA_BLOCKED'/);
 assert.match(ui,/Automatic publishing: DISABLED/);
});
