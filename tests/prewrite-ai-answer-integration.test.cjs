'use strict';
// The Pre-Write Brief server uses the AI answer research through src/prewrite-brief-research.cjs, called directly from
// src/index.js. Since the Canonical Architecture Migration nothing of this is inserted at build time; these checks run on
// the canonical build, which must leave the Pre-Write code as it is in the source.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepare}=require('../scripts/prepare-canonical-production.cjs');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');

test('a second canonical build is identical; no script tag is hardcoded, the version comes from the public files at start',()=>{
 const once=prepare(source);assert.equal(prepare(once),once);
 // A fixed tag in the source would keep an old tab in browsers that cached it for a year.
 assert.doesNotMatch(once,/<script defer src="\/prewrite-(?:ai-answer-research|research-tab)\.js/);
 assert.equal(once.split('${_prewriteBriefResearch.scriptTags()}').length-1,1);
});
test('canonical six-megabyte server compiles with the AI-answer research integration',()=>{
 const built=prepare(source);
 assert.match(built,/AI Answer Research — Write for Citation Potential/);
 assert.match(built,/AI answers researched/);
 const page=built.slice(built.indexOf('const _CLIENT_TRACKER_HTML = `'));
 assert.ok(page.indexOf('${_prewriteBriefResearch.scriptTags()}')<page.indexOf('id="prewriteBriefModal"'),'loaded in the page that holds the Pre-Write Brief modal');
 assert.ok(page.indexOf('AI Answer Research — Write for Citation Potential')>page.indexOf('id="prewriteBriefModal"'));
 // The server builds the research with the request's keyword, language and region, the same inputs the tab uses.
 assert.match(built,/_prewriteBriefResearch\.researchForRequest\(\{keyword,language,region,manualAi:_manualAi,perplexityEvidenceText:_perplexityEvidenceText,rejected:_manualAiRejected\}\)/);
 assert.match(built,/_prewriteBriefResearch\.attachToBrief\(brief,_pwbAiResearch\)/);
 // The writing prompt reaches the final prompt and parts 1 and 3 of the generation.
 assert.match(built,/const finalPrompt = prompt \+ '\\n\\nPRE-PUBLICATION AI WRITING RESEARCH:\\n' \+ _pwbAiWritingPrompt/);
 assert.match(built,/PRE-PUBLICATION WRITING RESEARCH:\\n\$\{_pwbAiWritingPrompt\.slice\(0,7000\)\}/);
 assert.match(built,/AI ANSWER RESEARCH FOR WRITING:\\n\$\{_pwbAiWritingPrompt\.slice\(0,9000\)\}/);
 // The per-system extraction is framed as writing research (entities, source leads), never as citation monitoring of
 // this website; the keys stay because the Brief and the Tracker evidence map read them.
 assert.match(built,/For EACH AI system, extract and retain as WRITING RESEARCH \(what the answer itself says; none of these fields says whether this website is or will be cited\)/);
 assert.match(built,/source leads listed in the answer, to verify independently before use\. Never read them as a measurement of this website\./);
 assert.doesNotMatch(built,/For EACH AI system, extract and retain:\n/);
 // "Complete missing only" refreshes the research saved with the Brief right after the merge (behaviour: migration test).
 const merge=built.indexOf('const _aiMerge=_pwbMergeManualAiEvidenceV506(');
 assert.ok(merge>0);assert.equal(built.split('const _aiMerge=_pwbMergeManualAiEvidenceV506(').length-1,1);
 assert.match(built.slice(merge,merge+600),/\n  _prewriteBriefResearch\.refreshAfterMissingOnly\(brief,\{query:srcKeyword\|\|requestedKeyword/);
 const os=require('node:os'),cp=require('node:child_process');
 const temp=path.join(os.tmpdir(),'prewrite-canonical-'+process.pid+'.js');
 fs.writeFileSync(temp,built);
 try{const check=cp.spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});assert.equal(check.status,0,String(check.stderr||'').slice(0,2200));}finally{fs.unlinkSync(temp);}
});
