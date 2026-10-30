'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
assert.match(code,/if\(main\.getAttribute\('data-owner-draft'\)==='true'\)/,
 'Only the authenticated owner view may automatically request the draft');
// Hybrid flow (owner decision): research and the checklist load automatically, text is written only on the owner's choice.
assert.doesNotMatch(code,/if\(validDraftPage\)void prepareDraft\(\)/,'Opening the page never starts writing by itself');
assert.match(code,/write:false\}/,'The owner research request asks for research and the gap list only');
assert.match(code,/prepare\.addEventListener\('click',prepareDraft\)/,'Writing the automatic plan stays available on an explicit click');
assert.match(code,/renderGrowthGapChecklist/,'The owner gets the choose-what-goes-on-your-site list');
assert.match(code,/if\(!validDraftPage\)\{/,
 'Unknown destination identity must prevent draft generation');
assert.match(code,/last===d/,
 'Stale async draft results must not overwrite the newer Growth research run');
assert.match(code,/d\.editorial_review_draft=\{/,
 'Research JSON must include explicit drafting status');
assert.match(code,/document\.getElementById\('downloadResearch'\)\.disabled=true/,
 'Do not export a half-completed automatic Growth result');
assert.match(code,/status:'PREPARING'/);
assert.match(code,/status:'DRAFT_UNAVAILABLE'/);
assert.match(code,/case_study_unchanged:true/);
assert.match(code,/published:false/);
assert.match(code,/document\.getElementById\('downloadResearch'\)\.disabled=false/);
assert.match(code,/JSON\.stringify\(last,null,2\)/,
 'Use the enriched report object rather than exporting the original research-only payload');
assert.match(code,/result\.target_url\|\|''\)!==String\(draftSourceUrl/,
 'Never accept a draft generated for a different URL');
assert.match(code,/growth\/auto-research\/complete\?page_id=/,
 'Owner completion is composed on the server, not only in browser state');
assert.match(code,/last=composite/,
 'Downloaded JSON is the complete server response');
assert.match(code,/published:false/,'Automatic Growth draft response is always explicitly not published');
console.log('PASS owner-only auto draft, same URL, safe export status, no Case Study writes');
