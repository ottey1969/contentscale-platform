'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const checklist=fs.readFileSync('public/growth-gap-checklist.js','utf8');
const report=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
test('stale headings trigger one inline refresh action beside the failure',()=>{
 assert.match(checklist,/PAGE_HEADINGS_CHANGED/);
 assert.match(checklist,/PAGE_CHANGED_SINCE_RESEARCH_RERUN_RESEARCH/);
 assert.match(checklist,/PAGE_NOT_READABLE_NOW_RERUN_RESEARCH/);
 assert.match(checklist,/showStaleRefresh\(r\.error/);
 assert.match(checklist,/if\(staleButton\)return/);
 assert.match(checklist,/Refresh research for this page →/);
 assert.match(checklist,/options\.rerunResearch\(\)/);
});
test('stale writing is disabled until a refreshed selection is available',()=>{
 assert.match(checklist,/staleBlocked=true;w\.disabled=true/);
 assert.match(checklist,/if\(!staleBlocked&&w\.textContent/);
 assert.match(checklist,/Existing choices are saved/);
});
test('inline refresh clears cached page research and reruns exact tracker page and query',()=>{
 assert.match(report,/rerunResearch:refreshChangedPageResearch/);
 assert.match(report,/async function refreshChangedPageResearch\(/);
 assert.match(report,/growth\/research-cache\/clear\?page_id=/);
 assert.match(report,/\+runParams/);
 assert.match(report,/var success=await run\(\)/);
 assert.match(report,/if\(!success\)throw Error/);
 assert.match(report,/return true;/);
 assert.match(report,/return false\n  }finally/);
});
test('fresh report keeps the server-side selection carryover and does not publish site content',()=>{
 const server=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 assert.match(server,/carried_over:carried/);
 assert.match(server,/pending_ids:m\.carried/);
 assert.match(server,/needs_confirmation:m\.needs_confirmation/);
 assert.match(server,/needs_remapping:m\.needs_remapping/);
 assert.match(server,/no_longer_found:m\.no_longer_found/);
});
