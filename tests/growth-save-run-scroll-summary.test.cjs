'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
test('Save and run navigates immediately to visible progress and after completion to primary action',()=>{
 assert.match(src,/status\.className='working';runProgressText\(true\);moveToResearch\('researchStatus'\)/);
 assert.match(src,/runProgressText\(false\);moveToResearch\('trackerNextAction'\)/);
 assert.match(src,/afterSaveStamp!==null&&Date\.now\(\)-Number\(afterSaveStamp\)<120000/);
 assert.match(src,/runProgressText\(false\);moveToResearch\('researchStatus'\)/);
 assert.match(src,/prefers-reduced-motion: reduce/);
 assert.match(src,/scrollMarginTop='96px'/);
 assert.match(src,/aria-live','polite'/);
});
test('research summary distinguishes measured evidence from provisional proposals and limitations',()=>{
 assert.match(src,/Research results · verified scope and next action/);
 assert.match(src,/not a measured Google ranking result/);
 assert.match(src,/not proven missing content/);
 assert.match(src,/whether your website is cited is UNKNOWN/);
 assert.match(src,/Some sources were unavailable or incomplete/);
 assert.doesNotMatch(src,/What the check found/);
});
test('scan status does not promise optional provider check or misdirect users to Advanced',()=>{
 assert.match(src,/AI-source checks are separate and only count when verifiable/);
 assert.doesNotMatch(src,/Manual answers are optional under Advanced/);
});
