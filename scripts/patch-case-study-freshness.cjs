'use strict';
const fs=require('fs'),file=process.argv[2]||'src/index.js';let s=fs.readFileSync(file,'utf8');
const a=s.indexOf("app.get('/case-study-report/:reportToken'");
const b=s.indexOf("// PATCH /api/tracker-client/:token/pages/:pageId/frequency",a);
if(a<0||b<a||b-a>14000)throw Error('Case Study report rendering moved; refuse change');
let route=s.slice(a,b);
if(route.includes('case_study_evidence_freshness_warning')){console.log('Case Study freshness banner already present');process.exit(0)}
const anchor='   const ai0=';if(!route.includes(anchor))throw Error('Report AI evidence anchor moved');
const addition=`   // Day-30 milestones are calendar markers, not proof that Day-30 GSC was imported.
   // Old reports may contain a snapshot date but no separately verified GSC date.
   const reportAt=Date.parse(d.generated_at||x.event_at||'')||Date.now();
   const gscAt=Date.parse(c.gsc_data_at||'')||0;
   const snapshotAt=Date.parse(c.at||'')||0;
   const observedAt=gscAt||snapshotAt;
   const observationAgeDays=observedAt?Math.max(0,Math.floor((reportAt-observedAt)/86400000)):null;
   const datedGscFresh=!!gscAt&&observationAgeDays!=null&&observationAgeDays<=7;
   const freshnessMessage=datedGscFresh
     ? 'GSC update timestamp is within seven days of this milestone. Values still reflect the saved reporting period, not a new scan.'
     : ('Historical evidence, not a verified fresh Day-30 GSC measurement. Report generated '+new Date(reportAt).toISOString().slice(0,10)
       +'; latest '+(gscAt?'GSC update':'Tracker snapshot')+' '+(observedAt?new Date(observedAt).toISOString().slice(0,10):'unknown')
       +'. Do not interpret unchanged clicks or impressions as a current 30-day performance result. Refresh exact-page GSC evidence before drawing conclusions.');
   const case_study_evidence_freshness_warning='<section role="status" style="background:#3d2b11;color:#ffefbf;border:1px solid #b57a22;padding:14px 18px;border-radius:10px;margin:18px 0"><strong>Evidence freshness:</strong> '+esc(freshnessMessage)+'</section>';
`;
route=route.replace(anchor,addition+anchor);
const mainH1='</h1>';if(!route.includes(mainH1))throw Error('Report header closing tag moved');
route=route.replace(mainH1,mainH1+'${case_study_evidence_freshness_warning}');
s=s.slice(0,a)+route+s.slice(b);
fs.writeFileSync(file,s);
console.log('Case Study milestone report now labels stale/undated GSC instead of implying Day-30 freshness');
