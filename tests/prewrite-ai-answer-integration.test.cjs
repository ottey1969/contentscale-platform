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
 const os=require('node:os'),cp=require('node:child_process');
 const temp=path.join(os.tmpdir(),'prewrite-canonical-'+process.pid+'.js');
 fs.writeFileSync(temp,built);
 try{const check=cp.spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});assert.equal(check.status,0,String(check.stderr||'').slice(0,2200));}finally{fs.unlinkSync(temp);}
});
