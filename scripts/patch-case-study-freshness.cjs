'use strict';
const fs=require('fs'),file=process.argv[2]||'src/index.js';let s=fs.readFileSync(file,'utf8');
const a=s.indexOf("app.get('/case-study-report/:reportToken'");
const b=s.indexOf("// PATCH /api/tracker-client/:token/pages/:pageId/frequency",a);
if(a<0||b<a||b-a>14000)throw Error('Case Study report rendering moved; refuse change');
let route=s.slice(a,b);
if(!route.includes('case_study_evidence_freshness_warning')){
const anchor='  const ai0=';if(!route.includes(anchor))throw Error('Report AI evidence anchor moved');
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
}
// Future milestone records also carry the actual last GSC Pages input timestamp.
const schedA=s.indexOf("type='cycle_day_30_report';const b=");
const schedB=s.indexOf("const reportUrl=",schedA);
if(schedA<0||schedB<schedA||schedB-schedA>7000)throw Error('Day-30 scheduler changed; refuse change');
let sched=s.slice(schedA,schedB);
if(!sched.includes('gsc_data_at:gscStamp')){
 const marker='eventData={milestone_day:30,generated_at:';
 const insert="const gscStampR=await pool.query('SELECT COALESCE(monitoring_gsc_pages_at,gsc_autofetch_checked_at) AS gsc_data_at FROM tracker_pages WHERE id=$1',[row.tracker_page_id]).catch(()=>({rows:[]}));const gscStamp=gscStampR.rows[0]&&gscStampR.rows[0].gsc_data_at||null;\n             ";
 if(!sched.includes(marker))throw Error('Day-30 evidence payload changed');
 sched=sched.replace(marker,insert+marker);
 const old="current:{at:snap.checked_at||new Date().toISOString(),gsc_clicks:";
 const newer="current:{at:snap.checked_at||null,gsc_data_at:gscStamp,gsc_clicks:";
 if(!sched.includes(old))throw Error('Day-30 current evidence payload changed');
 sched=sched.replace(old,newer);
 s=s.slice(0,schedA)+sched+s.slice(schedB);
}
fs.writeFileSync(file,s);
console.log('Case Study milestone report now labels stale/undated GSC instead of implying Day-30 freshness');
