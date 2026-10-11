'use strict';
function evaluateMeasurement(row,now=new Date()){
 const at=Date.parse(row.published_at);
 const days=Number.isFinite(at)?Math.floor((now.getTime()-at)/86400000):0;
 return {publication_id:row.id,page_id:row.tracker_page_id,query:row.query,url:row.url,
 published_at:row.published_at,notes:row.notes,days_since_publication:Math.max(0,days),
 measurement_status:days<28?'WAITING_FOR_28_DAYS':'NEEDS_DATED_GSC_WINDOWS',
 measured_click_change:null,measured_impression_change:null,
 reason:days<28?'At least 28 days must pass after publication before a full post-publication comparison.':'Stored GSC query rows have an import timestamp but no verified measurement start/end dates. A before/after comparison is not valid yet.',
 required_evidence:{before:'28 full days before the publication date',after:'28 full days after the publication date',same_page:true,same_query:true}};
}
function ymd(date){return new Date(date).toISOString().slice(0,10)}
function windowDates(publishedAt){
 const day=ymd(publishedAt),ms=Date.parse(day+'T00:00:00Z');
 return {before:{start:ymd(ms-28*86400000),end:ymd(ms-86400000)},after:{start:ymd(ms+86400000),end:ymd(ms+28*86400000)}};
}
function compareDatedWindows(publication,observations,now=new Date()){
 const basic=evaluateMeasurement(publication,now),w=windowDates(publication.published_at);
 basic.required_windows=w;
 if(basic.days_since_publication<29)return basic;
 const match=period=>observations.find(r=>r.period===period&&r.start_date===w[period].start&&r.end_date===w[period].end);
 const before=match('before'),after=match('after');
 if(!before||!after)return basic;
 basic.measurement_status='COMPARABLE_USER_PROVIDED_GSC';
 basic.measured_click_change=Number(after.clicks)-Number(before.clicks);
 basic.measured_impression_change=Number(after.impressions)-Number(before.impressions);
 basic.before={clicks:Number(before.clicks),impressions:Number(before.impressions)};
 basic.after={clicks:Number(after.clicks),impressions:Number(after.impressions)};
 basic.reason='Two explicit equal 28-day GSC periods supplied for the same URL and query. Attribution to this specific edit is not proven.';
 return basic;
}
function validateWindowInput(body,pub,now=new Date()){
 const w=windowDates(pub.published_at),period=String(body.period||'');
 if(!['before','after'].includes(period))return 'Select before or after';
 if(body.start_date!==w[period].start||body.end_date!==w[period].end)return 'The GSC date interval must match the exact 28-day comparison window';
 if(Date.parse(body.end_date+'T23:59:59Z')>now.getTime())return 'The period has not finished';
 if(String(body.query||'').toLowerCase().trim()!==String(pub.query||'').toLowerCase().trim())return 'Query differs from the registered publication';
 for(const k of ['clicks','impressions'])if(!Number.isSafeInteger(Number(body[k]))||Number(body[k])<0)return 'Clicks and impressions must be nonnegative whole numbers';
 if(Number(body.clicks)>Number(body.impressions))return 'Clicks cannot exceed impressions';
 if(!['gsc_page_query_export','gsc_manual_page_query'].includes(body.source))return 'Declare the actual GSC data source';
 return null;
}

function registerGrowthMeasurement(app,pool){
 app.get('/api/tracker-client/:token/growth/measurement',async(req,res)=>{
  try{
   const c=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!c)return res.status(404).json({success:false,error:'Tracker not found'});
   const exists=(await pool.query("SELECT to_regclass('public.tracker_growth_publications') IS NOT NULL AS ready")).rows[0]?.ready===true;
   if(!exists)return res.json({success:true,records:[],measurement_supported:false,reason:'No growth publications have been registered yet.'});
   const rows=(await pool.query(`SELECT g.id,g.tracker_page_id,g.query,g.notes,g.published_at,p.url
    FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id
    WHERE g.tracker_client_id=$1 ORDER BY g.published_at DESC,g.id DESC LIMIT 100`,[c.id])).rows;
   const hostname=new URL('https://'+String(c.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
   const safe=rows.filter(r=>{try{return new URL(r.url).hostname===hostname}catch{return false}});
   const winReady=(await pool.query("SELECT to_regclass('public.tracker_growth_gsc_windows') IS NOT NULL AS ready")).rows[0]?.ready===true;
   const windows=winReady?(await pool.query("SELECT publication_id,period,start_date::text,end_date::text,clicks,impressions FROM tracker_growth_gsc_windows WHERE tracker_client_id=$1 ORDER BY recorded_at DESC LIMIT 500",[c.id])).rows:[];
   res.set('Cache-Control','no-store').json({success:true,measurement_supported:winReady,
    evidence_limitation:'Only explicit, equal 28-day, same-page-and-query GSC windows count. Historical imports remain ineligible.',
    records:safe.map(r=>compareDatedWindows(r,windows.filter(w=>String(w.publication_id)===String(r.id))))});
  }catch(err){console.error('[growth-measurement]',err.message);res.status(503).json({success:false,error:'Growth measurement evidence currently unavailable'})}
 });

 app.get('/track/:token/growth/measurement',(req,res)=>{
  const token=encodeURIComponent(req.params.token);
  res.set('Cache-Control','no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth measurement</title><style>body{font:15px/1.55 system-ui;margin:25px auto;max-width:1000px;padding:10px;background:#f6f8fc;color:#192635}section{background:white;border:1px solid #d8dfed;border-radius:12px;padding:18px;margin:14px 0}label{display:block;margin:9px 0}input,select{padding:9px;margin:4px 0;display:block;max-width:400px;width:100%}button{background:#168347;border:0;border-radius:8px;padding:10px;color:white;cursor:pointer}button:disabled{opacity:.5}small{color:#64748b;display:block}strong{font-weight:700}</style></head><body><a href="/track/${token}/growth">← Growth Cockpit</a><h1>Measured click growth</h1><p>Use exact 28-day GSC page-query exports. Never use import timestamps as measurement dates. Results are observational, not proof of attribution to an edit.</p><main id="records">Loading records…</main><script>
const api='/api/tracker-client/${token}/growth/measurement';
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
async function load(){const el=document.getElementById('records');try{const r=await fetch(api,{cache:'no-store'});const d=await r.json();if(!d.success)throw Error(d.error||'Unavailable');if(!d.records.length){el.innerHTML='<section><h2>Step 1 — Record an actual published optimization</h2><p>No publications have been recorded for this Tracker yet. GSC cannot measure a before/after result without a real publication timestamp.</p><p><a href="/track/${token}/growth">← Return to Growth Cockpit</a> and choose a verified query on a page not locked by Case Study. Open <strong>Record actual publication</strong> after you have published an actual page improvement.</p><p><strong>Step 2:</strong> After 28 complete days and Google processing time, come back here to import both comparison windows automatically.</p><p>No new Brief or scan is needed. Existing Case Study baselines stay unchanged.</p></section>';return}
el.innerHTML=d.records.map(p=>{const w=p.required_windows||{};let forms=['before','after'].map(period=>{const dates=w[period];if(!dates)return '';return '<form data-id="'+Number(p.publication_id)+'" data-query="'+esc(p.query)+'" data-period="'+period+'"><h4>'+period.toUpperCase()+': '+esc(dates.start)+' through '+esc(dates.end)+'</h4><label>Clicks<input required type="number" min="0" name="clicks"></label><label>Impressions<input required type="number" min="0" name="impressions"></label><label>Source<select name="source"><option value="gsc_page_query_export">GSC page/query export</option><option value="gsc_manual_page_query">Manually transcribed GSC page/query</option></select></label><button>Record '+period+' GSC window</button><small role="status"></small></form>'}).join('');
return '<section><h3><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.query)+'</a></h3><p>Published: '+esc(p.published_at)+' · '+esc(p.measurement_status)+'</p><p>'+esc(p.reason)+'</p>'+(p.measured_click_change===null?'': '<p><strong>Observed click change: '+Number(p.measured_click_change)+'; impression change: '+Number(p.measured_impression_change)+'</strong> (not proof of causation)</p>')+'<button type="button" class="import-gsc" data-id="'+Number(p.publication_id)+'">Import both periods from GSC</button><small role="status" class="import-status"></small><details><summary>Enter the two exact GSC windows</summary>'+forms+'</details></section>'}).join('');
}catch(e){el.textContent='Unable to load measurement evidence: '+e.message}}
document.addEventListener('click',async e=>{const b=e.target.closest('button.import-gsc');if(!b)return;const status=b.nextElementSibling;b.disabled=true;b.textContent='Checking GSC…';status.textContent='';try{const r=await fetch(api+'/import-gsc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publication_id:Number(b.dataset.id)})});const d=await r.json();if(!d.success)throw Error(d.error||'Not imported');await load()}catch(err){status.textContent=err.message}finally{b.disabled=false;b.textContent='Import both periods from GSC'}});
document.addEventListener('submit',async e=>{const f=e.target;if(!f.matches('form[data-id]'))return;e.preventDefault();const b=f.querySelector('button'),status=f.querySelector('[role=status]');b.disabled=true;b.textContent='Saving…';try{const r=await fetch(api+'/window',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publication_id:Number(f.dataset.id),query:f.dataset.query,period:f.dataset.period,start_date:f.querySelector('h4').textContent.match(/\\d{4}-\\d{2}-\\d{2}/g)[0],end_date:f.querySelector('h4').textContent.match(/\\d{4}-\\d{2}-\\d{2}/g)[1],clicks:Number(f.elements.clicks.value),impressions:Number(f.elements.impressions.value),source:f.elements.source.value})});const d=await r.json();if(!d.success)throw Error(d.error||'Not saved');await load()}catch(e){status.textContent=e.message}finally{b.disabled=false;b.textContent='Record '+f.dataset.period+' GSC window'}});load();
</script></body></html>`);
 });
 app.post('/api/tracker-client/:token/growth/measurement/window',async(req,res)=>{
  try{
   const c=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!c)return res.status(404).json({success:false,error:'Tracker not found'});
   const publicationId=Number(req.body?.publication_id);
   if(!Number.isSafeInteger(publicationId)||publicationId<1)return res.status(400).json({success:false,error:'Invalid publication'});
   const rr=await pool.query("SELECT g.id,g.tracker_page_id,g.query,g.published_at,p.url FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id WHERE g.id=$1 AND g.tracker_client_id=$2",[publicationId,c.id]);
   const pub=rr.rows[0];if(!pub)return res.status(404).json({success:false,error:'Publication not found'});
   const host=new URL(pub.url).hostname,domain=new URL('https://'+String(c.domain).replace('https://','').replace('http://','').split('/')[0]).hostname;
   if(host!==domain)return res.status(403).json({success:false,error:'Different website'});
   const locked=await pool.query("SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active' LIMIT 1",[c.id,pub.tracker_page_id]);
   if(locked.rows.length)return res.status(409).json({success:false,error:'Case Study is locked: no measurement input permitted'});
   const err=validateWindowInput(req.body||{},pub);if(err)return res.status(400).json({success:false,error:err});
   await pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_gsc_windows(
     id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,publication_id BIGINT NOT NULL,
     period TEXT NOT NULL CHECK (period IN ('before','after')),
     start_date DATE NOT NULL,end_date DATE NOT NULL,
     clicks INTEGER NOT NULL,impressions INTEGER NOT NULL,source TEXT NOT NULL,
     recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(tracker_client_id,publication_id,period))`);
   // Explicit correction replaces a previously supplied period; no Case Study or canonical GSC history touched.
   await pool.query(`INSERT INTO tracker_growth_gsc_windows
    (tracker_client_id,publication_id,period,start_date,end_date,clicks,impressions,source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (tracker_client_id,publication_id,period) DO UPDATE SET
      start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,
      clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,source=EXCLUDED.source,recorded_at=NOW()`,
    [c.id,publicationId,req.body.period,req.body.start_date,req.body.end_date,Number(req.body.clicks),Number(req.body.impressions),req.body.source]);
   res.json({success:true,state:'GSC_WINDOW_RECORDED',attribution_proven:false,provenance:'user_provided_page_query_gsc'});
  }catch(e){console.error('[growth-window]',e.message);res.status(503).json({success:false,error:'Could not record dated GSC evidence'})}
 });

}
module.exports={evaluateMeasurement,registerGrowthMeasurement,windowDates,compareDatedWindows,validateWindowInput};
