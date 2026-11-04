'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {patch}=require('../scripts/patch-prewrite-ai-answer-research.cjs');

test('a second canonical build is identical; a stale unversioned tag fails the build',()=>{
 const {prepare}=require('../scripts/prepare-canonical-production.cjs');
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const once=prepare(source);assert.equal(prepare(once),once);
 const stale=once.replace(/<script defer src="\/prewrite-ai-answer-research\.js\?v=[0-9a-f]+"><\/script>\\n<script defer src="\/prewrite-research-tab\.js\?v=[0-9a-f]+"><\/script>\\n/,'<script defer src="/prewrite-research-tab.js"></script>\\n');
 assert.notEqual(stale,once);assert.throws(()=>patch(stale),/PREWRITE_RESEARCH_TAB_SCRIPT_VERSION_CONFLICT/);
});
test('canonical six-megabyte server compiles after AI-answer research integration and is idempotent',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const built=patch(source);
 assert.equal(patch(built),built,'no double injection on repeated builds');
 assert.match(built,/AI Answer Research — Write for Citation Potential/);
 assert.match(built,/AI answers researched/);
 // Both scripts are loaded once, in the Tracker page that holds the Pre-Write Brief, with a content version (public/ is
 // cached for a year), the shared prompt module before the tab.
 const tags=built.match(/<script defer src="\/prewrite-(ai-answer-research|research-tab)\.js\?v=[0-9a-f]{12}"><\/script>/g)||[];
 assert.deepEqual(tags.map(t=>t.match(/prewrite-[a-z-]+\.js/)[0]),['prewrite-ai-answer-research.js','prewrite-research-tab.js']);
 assert.equal(built.split('prewrite-research-tab.js').length - 1,1);assert.equal(built.split('src="/prewrite-ai-answer-research.js').length - 1,1);
 const page=built.slice(built.indexOf('const _CLIENT_TRACKER_HTML = `'));
 assert.ok(page.indexOf('prewrite-research-tab.js')<page.indexOf('id="prewriteBriefModal"'),'loaded in the page that holds the Pre-Write Brief modal');
 assert.ok(page.indexOf('AI Answer Research — Write for Citation Potential')>page.indexOf('id="prewriteBriefModal"'));
 // The server builds the research with the request's keyword, language and region, the same inputs the tab uses.
 assert.match(built,/makePrewriteAiAnswerResearch\(\{query:keyword,language:language,market:region,answers:\[/);
 assert.match(built,/\{engine:'perplexity',answer:_perplexityEvidenceText,source:_manualAi\.perplexity\?'manual':'automatic fallback'\}/);
 assert.match(built,/prewrite_ai_answer_research=_pwbAiResearch/);
 assert.match(built,/const _pwbAiWritingPrompt=buildPrewriteResearchPrompt\(_pwbAiResearch\)/);
 assert.match(built,/PRE-PUBLICATION WRITING RESEARCH/);
 assert.match(built,/AI ANSWER RESEARCH FOR WRITING/);
 // Defect 7: the per-system extraction is framed as writing research (entities, source leads), never as citation
 // monitoring of this website; the keys stay because the Brief and the Tracker evidence map read them.
 assert.match(built,/For EACH AI system, extract and retain as WRITING RESEARCH \(what the answer itself says; none of these fields says whether this website is or will be cited\)/);
 assert.match(built,/source leads listed in the answer, to verify independently before use\. Never read them as a measurement of this website\./);
 assert.doesNotMatch(built,/For EACH AI system, extract and retain:\n/);
 // Defect 8: "Complete missing only" rebuilds the research saved with the Brief from the merged evidence, right after the merge.
 const merge=built.indexOf('const _aiMerge=_pwbMergeManualAiEvidenceV506(');
 assert.ok(merge>0);
 const after=built.slice(merge,merge+1400);
 assert.match(after,/brief\.prewrite_ai_answer_research=_R\.makePrewriteAiAnswerResearch\(\{query:srcKeyword\|\|requestedKeyword/);
 assert.equal(built.split('const _aiMerge=_pwbMergeManualAiEvidenceV506(').length-1,1);
 // Run the inserted rebuild on a TEST brief: two answers saved earlier (one automatic Perplexity), three added by the
 // missing-only merge. The saved research must then list all five, keep language/market and the automatic source.
 const R=require('../src/prewrite-ai-answer-research.cjs');
 const code=after.slice(after.indexOf('try{const _R='),after.indexOf('}catch(_e){}')+'}catch(_e){}'.length);
 const prev=R.makePrewriteAiAnswerResearch({query:'TEST content scaling',language:'Dutch',market:'nl',answers:[{engine:'google_aio',answer:'TEST google'},{engine:'perplexity',answer:'TEST automatic perplexity',source:'automatic fallback',sources:['https://example.org/prior']}]});
 const brief={prewrite_ai_answer_research:prev,ai_system_evidence:{google_aio:{text:'TEST google',checked:true},chatgpt:{text:'TEST chatgpt',checked:true},claude:{text:'TEST claude',checked:true},copilot:{text:'TEST copilot',checked:true}}};
 vm.runInNewContext(code,{require:m=>m==='./prewrite-ai-answer-research.cjs'?R:require(m),brief,srcKeyword:'TEST content scaling',requestedKeyword:'',srcReq:{},opts:{}});
 const r=brief.prewrite_ai_answer_research;
 assert.equal(r.systems_researched,5);assert.equal(r.language,'Dutch');assert.equal(r.market,'nl');
 assert.equal(r.observations.find(x=>x.engine==='perplexity').answer_source,'automatic fallback');
 assert.deepEqual(Array.from(r.observations.find(x=>x.engine==='perplexity').source_urls),['https://example.org/prior']);
 assert.match(R.buildPrewriteResearchPrompt(r),/AI answers researched: 5\/5/);
 const os=require('node:os'),cp=require('node:child_process');
 const temp=path.join(os.tmpdir(),'prewrite-canonical-'+process.pid+'.js');
 fs.writeFileSync(temp,built);
 try{const check=cp.spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});assert.equal(check.status,0,String(check.stderr||'').slice(0,2200));}finally{fs.unlinkSync(temp);}
});
