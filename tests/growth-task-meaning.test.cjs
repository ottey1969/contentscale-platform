'use strict';
// Meaning check for reader tasks, on the real research data of production report 55 (page 2294, "ai citation tracker").
// The research data is real. The model ANSWERS below are hand-written test inputs (labelled MODEL_ANSWER): these tests
// check how Growth validates and applies an answer, and that it fails closed; they do not test the model's judgement.
const test=require('node:test'),assert=require('node:assert/strict');
const {judgeTaskMeaning,applyTaskMeaning,validateTaskVerdicts,taskJudgeInput,judgeDraftAnswers,answerCheckFor,answerKey,geminiModel}=require('../src/growth-task-meaning.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const fresh=()=>JSON.parse(JSON.stringify(r55.reader_task_coverage));
const pageSections=r55.reader_task_coverage.destination_sections.map(s=>({heading:s.heading,text:''}));
const hostsOf=(cov,code)=>[...new Set(cov.tasks.find(t=>t.code===code).competitor_support.map(s=>s.host))];
const gate=coverage=>decideGrowthEditorialAction({report:r55,destination:r55.destination_section_comparison,coverage,
 serpIntent:r55.serp_intent,destinationIntent:r55.destination_intent,attempts:r55.attempted_sources});
const modelSaying=answer=>({model:'test',call:async()=>JSON.stringify(answer)});
// MODEL_ANSWER: what a correct judgement of report 55 looks like (owner review of report 55).
const CORRECT={tasks:[
 {code:'task_priori',same_question:false,reason:'One section asks how to prioritize content for citations vs mentions, the other which AI platform to track first.'},
 {code:'task_manual',same_question:true,reader_question:'How do I check AI citations for my keywords manually?',supporting_hosts:['blog.hubspot.com','otterly.ai'],page_answers:'NO',page_heading:null,reason:'Both explain a manual audit of AI answers.'},
 {code:'task_dashbo',same_question:true,reader_question:'How do I set up a dashboard to report AI citations over time?',supporting_hosts:['blog.hubspot.com','otterly.ai'],page_answers:'NO',page_heading:null,reason:'Both describe a reporting dashboard.'}]};

test('report 55 as it ran: word matching put "prioritize" (two different questions) into the plan',()=>{
 assert.deepEqual(r55.decision_in_report.plan,['task_priori','task_manual']);
 const priori=r55.reader_task_coverage.tasks.find(t=>t.code==='task_priori');
 assert.deepEqual(priori.competitor_support.map(s=>s.heading),['What is the best way to prioritize content for citations vs mentions?','Which AI search platform should I prioritize for tracking?']);
});

test('a confirmed judgement keeps only tasks with one reader question; the gate then plans only those',async()=>{
 const cov=fresh();
 const j=await judgeTaskMeaning({query:'ai citation tracker',coverage:cov,pageSections,model:modelSaying(CORRECT)});
 assert.equal(j.status,'JUDGED');
 applyTaskMeaning(cov,j);
 assert.equal(cov.tasks.find(t=>t.code==='task_priori').meaning.status,'DIFFERENT_QUESTIONS');
 assert.equal(cov.tasks.find(t=>t.code==='task_manual').reader_question,'How do I check AI citations for my keywords manually?');
 const g=gate(cov);
 assert.equal(g.decision,'IMPROVE_EXISTING');
 assert(!g.improvement_plan.tasks.some(t=>t.code==='task_priori'),'the "prioritize" pair is gone');
 assert(g.improvement_plan.tasks.every(t=>t.reader_question),'every planned task carries its reader question');
});

test('the page verdict replaces the word-based status: a passing mention of "traffic" is not an answer',async()=>{
 const cov=fresh();
 const traffic=cov.tasks.find(t=>t.code==='task_traffi');
 assert.equal(traffic.destination.status,'COVERED','word matching: COVERED because a case study mentions organic traffic');
 const answer={tasks:[{code:'task_traffi',same_question:true,reader_question:'Should AI referral traffic be reported separately from organic traffic?',
  supporting_hosts:hostsOf(cov,'task_traffi'),page_answers:'NO',page_heading:null,reason:'The page only mentions an organic traffic drop in a case study.'}]};
 applyTaskMeaning(cov,await judgeTaskMeaning({query:'ai citation tracker',coverage:cov,pageSections,model:modelSaying(answer)}));
 assert.equal(traffic.destination.status,'NOT_OBSERVED');
 assert.equal(traffic.destination.word_match_status,'COVERED');
});

test('an answer is only accepted when it stands on the input: invented hosts, headings or single sources are rejected',()=>{
 const input=taskJudgeInput(fresh(),pageSections);
 const v=(over)=>validateTaskVerdicts(JSON.stringify({tasks:[{code:'task_manual',same_question:true,reader_question:'How do I check AI citations manually?',
  supporting_hosts:['blog.hubspot.com','otterly.ai'],page_answers:'NO',page_heading:null,reason:'r',...over}]}),input);
 assert.equal(v({}).verdicts.task_manual.same_question,true);
 assert.equal(v({supporting_hosts:['blog.hubspot.com','example-invented.com']}).verdicts.task_manual,undefined,'invented host');
 assert.equal(v({supporting_hosts:['blog.hubspot.com']}).verdicts.task_manual,undefined,'one source is not agreement');
 assert.equal(v({page_answers:'PARTLY',page_heading:'A heading the page does not have'}).verdicts.task_manual,undefined,'invented heading');
 assert.equal(v({page_answers:'PARTLY',page_heading:'⚙️ How AI Citation Trackers Actually Work'}).verdicts.task_manual.page_answers,'PARTLY','existing heading');
 assert.equal(v({reader_question:''}).verdicts.task_manual,undefined,'no question stated');
 assert.equal(v({code:'task_invented'}).verdicts.task_invented,undefined,'unknown task');
 assert.equal(validateTaskVerdicts('not json',input).status,'INVALID_JUDGEMENT');
});

test('fail closed: without a usable judgement nothing is confirmed and the gate says TASK_MEANING_NOT_VERIFIED',async()=>{
 for(const model of [null,{model:'t',call:async()=>{throw Object.assign(Error('x'),{code:'JUDGE_HTTP_503'})}},modelSaying('garbage')]){
  const cov=fresh();
  const j=await judgeTaskMeaning({query:'ai citation tracker',coverage:cov,pageSections,model});
  applyTaskMeaning(cov,j);
  assert.equal(cov.tasks.filter(t=>t.supported_by_competitors).length,0,j.status);
  const g=gate(cov);
  assert.equal(g.decision,'DATA_BLOCKED',j.status);assert.equal(g.blocker_code,'TASK_MEANING_NOT_VERIFIED',j.status);
 }
 // A judgement whose every answer fails validation confirms nothing either.
 const cov=fresh();
 applyTaskMeaning(cov,await judgeTaskMeaning({query:'ai citation tracker',coverage:cov,pageSections,
  model:modelSaying({tasks:cov.tasks.filter(t=>t.supported_by_competitors).map(t=>({code:t.code,same_question:true,reader_question:'Some question here?',supporting_hosts:['invented.example','other.example'],page_answers:'NO',page_heading:null}))})}));
 assert.equal(gate(cov).blocker_code,'TASK_MEANING_NOT_VERIFIED');
 assert.equal(geminiModel({apiKey:''}),null,'no key configured means no judge, never a guess');
});

test('when every candidate turns out to be two different questions, Growth says so instead of inventing a gap',async()=>{
 const cov=fresh();
 const answer={tasks:cov.tasks.filter(t=>t.supported_by_competitors).map(t=>({code:t.code,same_question:false,reason:'different questions'}))};
 applyTaskMeaning(cov,await judgeTaskMeaning({query:'ai citation tracker',coverage:cov,pageSections,model:modelSaying(answer)}));
 const g=gate(cov);
 assert.equal(g.decision,'DATA_BLOCKED');assert.equal(g.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
 assert.match(g.missing_evidence[0].detail,/answered different reader questions/);
});

test('draft answer check: report 55\'s "prioritize" text under a manual-audit question is rejected; unchecked is not accepted',async()=>{
 const task={code:'task_manual',reader_question:'How do I check AI citations for my keywords manually?'};
 const section={h2:'How to Prioritize Content Using Domain Authority and Organic Traffic Metrics',paragraphs:['To prioritize optimization tasks effectively, evaluate your content assets using domain authority metrics and existing organic traffic levels.']};
 // MODEL_ANSWER
 const ac=await judgeDraftAnswers({sections:[section],tasks:[task],model:modelSaying({sections:[{id:answerKey(section.h2,'task_manual'),answers:false,reason:'It is about prioritizing pages by SEO metrics, not a manual audit.'}]})});
 assert.equal(answerCheckFor(task,ac,section.h2).code,'DRAFT_DOES_NOT_ANSWER_QUESTION');
 assert.equal(answerCheckFor(task,{status:'JUDGE_UNAVAILABLE',verdicts:{}},section.h2).code,'DRAFT_ANSWER_NOT_VERIFIED');
 assert.equal(answerCheckFor(task,await judgeDraftAnswers({sections:[section],tasks:[task],model:null}),section.h2).code,'DRAFT_ANSWER_NOT_VERIFIED');
 const ok=await judgeDraftAnswers({sections:[section],tasks:[task],model:modelSaying({sections:[{id:answerKey(section.h2,'task_manual'),answers:true,reason:'r'}]})});
 assert.equal(answerCheckFor(task,ok,section.h2),null);
 assert.equal(answerCheckFor({code:'task_x'},ac,section.h2),null,'a task without a reader question (no meaning check) is not affected');
});
