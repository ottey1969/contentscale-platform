'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {patch}=require('../scripts/patch-prewrite-ai-answer-research.cjs');

test('canonical six-megabyte server compiles after AI-answer research integration and is idempotent',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const built=patch(source);
 assert.equal(patch(built),built,'no double injection on repeated builds');
 assert.match(built,/AI Answer Research — Write for Citation Potential/);
 assert.match(built,/AI answers researched/);
 assert.ok(built.includes('<script defer src="/prewrite-research-tab.js"></script>'));
 assert.equal(built.split('prewrite-research-tab.js').length - 1,1);
 assert.match(built,/prewrite_ai_answer_research=_pwbAiResearch/);
 assert.match(built,/const _pwbAiWritingPrompt=buildPrewriteResearchPrompt\(_pwbAiResearch\)/);
 assert.match(built,/PRE-PUBLICATION WRITING RESEARCH/);
 assert.match(built,/AI ANSWER RESEARCH FOR WRITING/);
 const os=require('node:os'),cp=require('node:child_process');
 const temp=path.join(os.tmpdir(),'prewrite-canonical-'+process.pid+'.js');
 fs.writeFileSync(temp,built);
 try{const check=cp.spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});assert.equal(check.status,0,String(check.stderr||'').slice(0,2200));}finally{fs.unlinkSync(temp);}
});
