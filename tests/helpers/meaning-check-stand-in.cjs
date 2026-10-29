'use strict';
// TEST STAND-IN for the language-model meaning check (src/growth-task-meaning.cjs). Tests that use it cover what happens
// AFTER a reader task is confirmed (claims, placement, protection, handoff). It confirms every word-matched candidate as
// one reader question (its label), keeps the word-based page status, and accepts every drafted section as answering it.
// The meaning check itself, including rejection and fail-closed behaviour, is tested in growth-task-meaning.test.cjs.
const PAGE={COVERED:'YES',PARTIAL:'PARTLY'};
const judgeTasks=async({coverage})=>({status:'JUDGED',model:'test-stand-in',verdicts:Object.fromEntries((coverage.tasks||[])
 .filter(t=>t.supported_by_competitors).map(t=>[t.code,{same_question:true,reader_question:String(t.label).replace(/^Competitors teach\s*/i,'').replace(/^[“"]|[”"]$/g,''),
  supporting_hosts:[...new Set(t.competitor_support.map(s=>s.host))],page_answers:PAGE[t.destination?.status]||'NO',
  page_heading:t.destination?.passages?.[0]?.heading||null,reason:'test stand-in'}]))});
const {answerKey}=require('../../src/growth-task-meaning.cjs');
const judgeAnswers=async({sections,tasks})=>({status:'JUDGED',model:'test-stand-in',
 verdicts:Object.fromEntries((sections||[]).flatMap(s=>(tasks||[]).map(t=>[answerKey(s.h2,t.code),{answers:true,reason:'test stand-in'}])))});
module.exports={judgeTasks,judgeAnswers,meaningStandIn:{judgeTasks,judgeAnswers}};
