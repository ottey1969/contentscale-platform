'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=process.argv[2]||'src/index.js',dst=process.argv[3]||'/tmp/contentscale-case-study-guidance.js';
let s=fs.readFileSync(src,'utf8');
const anchor="  if(claimsFactsAt&&(!evaluatedAt||claimsFactsAt>evaluatedAt)){";
const fix=`  // Case-study prerequisites outrank a stale-brief Claims & Facts notification.
  // Guidance only: never bypass canonical scan eligibility or mutate protected baselines.
  if(!bool(p.case_study_active)&&p.case_study_readiness&&!bool(p.case_study_readiness.ready)){
    var _baseline=p.case_study_readiness;
    var _missing=Array.isArray(_baseline.missing)?_baseline.missing:[];
    var _missingGsc=!bool(_baseline.gsc_pages)||!bool(_baseline.gsc_queries);
    var _missingAi=Number(_baseline.ai_checked||0)<5;
    var _baselineButton=_missingGsc?'Fetch exact-page GSC':(_missingAi?'Complete AI checks':null);
    var _baselineAction=_missingGsc?'setBaselineGsc('+p.id+',event)':(_missingAi?'openAiEvidence('+p.id+')':null);
    return {code:'CASE_BASELINE_INCOMPLETE',label:'CASE STUDY · BASELINE INCOMPLETE',detail:'The previous scan stays historical. Complete the missing baseline evidence: '+(_missing.length?_missing.join('; '):'verify baseline readiness')+'. Monitoring Off does not erase the previous scan.',color:'#fbbf24',border:'#a16207',bg:'#2a1f05',button:_baselineButton||'',buttonAction:_baselineAction||''};
  }
`;
assert.equal(s.split(anchor).length,2,'Unexpected Claims & Facts next-action anchor');
if(s.includes("code:'CASE_BASELINE_INCOMPLETE'")){console.log('already patched');process.exit(0);}
s=s.replace(anchor,fix+anchor);
fs.writeFileSync(dst,s);
console.log(JSON.stringify({patched:true,output:dst,sourceBytes:Buffer.byteLength(s)}));
