'use strict';
const fs=require('node:fs');
const file='src/index.js';
let s=fs.readFileSync(file,'utf8');
const a="function _trackerNextActionState(p,isDone,lastCheckedRaw,nextEvidence){";
const b=a+String.raw`
  // Completed Case Studies do not inherit stale next-scan opportunities from historical Briefs.
  if(p&&p.case_study_ended_at&&!p.case_study_active){
    var endDate='';try{endDate=new Date(p.case_study_ended_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});}catch(e){}
    return {code:'CASE_STUDY_ENDED',label:'CASE STUDY ENDED'+(endDate?' · '+endDate:''),
      detail:'The measurement and its monitoring schedule have ended. The original baseline and report remain in history. No further scans will run without your explicit permission.',
      color:'#cbd5e1',border:'#475569',bg:'#111827',button:'',buttonAction:''};
  }`;
if(s.includes("code:'CASE_STUDY_ENDED'"))throw Error('Patch already applied');
if(s.split(a).length!==2)throw Error('Next-action entry must occur exactly once');
s=s.replace(a,b);
const x="function _trackerImplementationCheckHtml(p,isDone,nextState){";
const y=x+"\n  if(p&&p.case_study_ended_at&&!p.case_study_active)return ''; // Historic implementation notes remain in history, not as open actions.";
if(s.split(x).length!==2)throw Error('Implementation entry must occur once');
s=s.replace(x,y);
fs.writeFileSync(file,s);
console.log('Added explicit ended state to canonical Tracker UI');
