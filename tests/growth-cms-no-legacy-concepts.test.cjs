'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
const server=fs.readFileSync('src/tracker-growth-cms-export.cjs','utf8');
test('no old drafts or old concept picker in any section, including Advanced',()=>{
 assert.doesNotMatch(ui,/renderEarlier\(|safe\.added|added_growth_proposal_ids|growthEarlier|Advanced · Older saved concepts|Also written for this page/);
 assert.doesNotMatch(html,/id="growthEarlier"/);
 assert.match(ui,/Review proposed text and claims/);
 assert.match(ui,/Skip this draft · write verified content myself/);
});
test('CMS API cannot return or silently merge past proposals',()=>{
 assert.match(server,/const p=aligned\[0\]\|\|null/);
 assert.match(server,/query_match_required:true/);
 assert.doesNotMatch(server,/earlier:earlier\.map\(shape\)/);
 assert.doesNotMatch(server,/other_query_proposals:mismatched/);
 assert.match(server,/LEGACY_PROPOSAL_ADDITIONS_NOT_SUPPORTED/);
 assert.match(server,/addedProposalIds:\[\]/);
 assert.doesNotMatch(server,/for\(const id of added\)/);
});
test('meta suggestions limited to current question and its latest proposal',()=>{
 assert.match(server,/const current=rows\.find\(p=>sameIntent\(p\.focus_query,requested\)\)/);
 assert.match(server,/const concepts=\[\.\.\.new Set\(\(current\?\.sections\|\|\[\]\)/);
 assert.match(ui,/seo-proposal\?page_id=[^\n]+&query=/);
});
