'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
assert.match(code,/if\(main\.getAttribute\('data-owner-draft'\)==='true'\)/,
 'Only the authenticated owner view may automatically request the draft');
assert.match(code,/if\(validDraftPage\)void prepareDraft\(\)/,
 'A validated existing page must start the optional editorial draft after research');
assert.match(code,/if\(!validDraftPage\)\{/,
 'Unknown destination identity must prevent draft generation');
assert.match(code,/last===d/,
 'Stale async draft results must not overwrite the newer Growth research run');
assert.match(code,/d\.editorial_review_draft=\{/,
 'Research JSON must include explicit drafting status');
assert.match(code,/document\.getElementById\('downloadResearch'\)\.disabled=true/,
 'Do not export a half-completed automatic Growth result');
assert.match(code,/status:'PREPARING'/);
assert.match(code,/status:'UNAVAILABLE'/);
assert.match(code,/case_study_unchanged:true/);
assert.match(code,/published:false/);
assert.match(code,/document\.getElementById\('downloadResearch'\)\.disabled=false/);
assert.match(code,/JSON\.stringify\(last,null,2\)/,
 'Use the enriched report object rather than exporting the original research-only payload');
assert.match(code,/result\.canonical_url\|\|''\)!==String\(draftSourceUrl/,
 'Never accept a draft generated for a different URL');
assert.doesNotMatch(code,/auto[_-]?publish/i,'Automatic Growth draft must not publish');
console.log('PASS owner-only auto draft, same URL, safe export status, no Case Study writes');
