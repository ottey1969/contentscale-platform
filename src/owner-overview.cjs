'use strict';
// Owner overview (owner 2026-11-28: "een pagina waar ik alles zie en naar toe kan"). One page, owner only, in English:
// every admin area with a link and today's / this week's numbers. Signed in with the same login as Free Growth admin
// (GROWTH_FREE_ADMIN_KEY). Nothing here is visible without that session; the API answers 404 like the other admin APIs.
const {ownerSessionValid,adminKeyOf}=require('./owner-session.cjs');

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Each area: where to go, what it is for, and the counts to show. A missing table counts as "no data", never as an error.
const AREAS=[
 {id:'admin',name:'Admin dashboard',url:'/admin',what:'Users, scan log, engine codes, Tracker clients, leaderboard, messages.',
  counts:[['Tracker clients (active)',`SELECT COUNT(*)::int AS n FROM tracker_clients WHERE status IS NULL OR status NOT IN ('deleted','disabled','paused')`]]},
 {id:'free_growth',name:'Free Growth admin',url:'/free-growth/admin',what:'Checks, invitations, hire requests, contacts, reminders, Firecrawl usage.',
  counts:[['Checks today',`SELECT COUNT(*)::int AS n FROM growth_free_checks WHERE cached_from IS NULL AND created_at>=date_trunc('day',NOW())`],
   ['Checks this week',`SELECT COUNT(*)::int AS n FROM growth_free_checks WHERE cached_from IS NULL AND created_at>NOW()-INTERVAL '7 days'`],
   ['Failed today',`SELECT COUNT(*)::int AS n FROM growth_free_checks WHERE status='FAILED' AND created_at>=date_trunc('day',NOW())`]]},
 {id:'free_prewrite',name:'Free Pre-Write',url:'/free-pre-write',what:'The public brief form (you are not limited while signed in).',
  counts:[['Briefs today',`SELECT COUNT(*)::int AS n FROM prewrite_briefs WHERE public_access_hash IS NOT NULL AND created_at>=date_trunc('day',LOCALTIMESTAMP)`],
   ['Briefs this week',`SELECT COUNT(*)::int AS n FROM prewrite_briefs WHERE public_access_hash IS NOT NULL AND created_at>LOCALTIMESTAMP-INTERVAL '7 days'`],
   ['Failed today',`SELECT COUNT(*)::int AS n FROM prewrite_briefs WHERE public_access_hash IS NOT NULL AND status='failed' AND created_at>=date_trunc('day',LOCALTIMESTAMP)`]]},
 {id:'tracker_prewrite',name:'Tracker Pre-Write',url:'/admin',what:'Briefs made inside client Trackers (open a client in the Admin dashboard).',
  counts:[['Briefs today',`SELECT COUNT(*)::int AS n FROM prewrite_briefs WHERE client_id IS NOT NULL AND created_at>=date_trunc('day',LOCALTIMESTAMP)`]]},
 {id:'gsc',name:'GSC reports',url:'/gsc',what:'Search Console audits and shared report links.',
  counts:[['Reports today',`SELECT COUNT(*)::int AS n FROM gsc_reports WHERE created_at>=date_trunc('day',NOW())`],
   ['Reports this week',`SELECT COUNT(*)::int AS n FROM gsc_reports WHERE created_at>NOW()-INTERVAL '7 days'`]]},
 {id:'quick_scan',name:'Quick Scan',url:'/quick-scan/admin',what:'Prospect Quick Scans, campaign links and reminders. Cockpit: /quick-scan/cockpit.',
  counts:[['Started today',`SELECT COUNT(*)::int AS n FROM prospect_quick_scans WHERE created_at>=date_trunc('day',NOW())`],
   ['Failed today',`SELECT COUNT(*)::int AS n FROM prospect_quick_scans WHERE status='failed' AND created_at>=date_trunc('day',NOW())`]]},
 {id:'ceo',name:'CEO reports',url:'/ceo',what:'Create a CEO report; existing reports and their Quick Scans are in Quick Scan admin.',
  counts:[['Reports today',`SELECT COUNT(*)::int AS n FROM opportunity_reports WHERE created_at>=date_trunc('day',NOW())`],
   ['Reports this week',`SELECT COUNT(*)::int AS n FROM opportunity_reports WHERE created_at>NOW()-INTERVAL '7 days'`]]},
 {id:'rank',name:'Free Rank Tracker',url:'/rank-tracker/admin',what:'Free rank tracker accounts and keywords.',
  counts:[['New accounts today',`SELECT COUNT(*)::int AS n FROM rank_free_accounts WHERE created_at>=date_trunc('day',NOW())`]]},
 {id:'network',name:'Network cockpit',url:'/network/admin',what:'Placements, acquisition, directory and opportunities.',
  counts:[['Placements today',`SELECT COUNT(*)::int AS n FROM network_placements WHERE created_at>=date_trunc('day',NOW())`]]},
 {id:'firecrawl',name:'Firecrawl usage',url:'/free-growth/admin#firecrawlSection',what:'Remaining credits per key, active key and usage per module.',counts:[]}
];
async function count(pool,sql){
 try{const r=(await pool.query(sql)).rows[0];return Number.isFinite(r?.n)?r.n:null}catch{return null}
}
async function overview(pool,{firecrawl}={}){
 const areas=await Promise.all(AREAS.map(async a=>({id:a.id,name:a.name,url:a.url,what:a.what,
  counts:pool?await Promise.all(a.counts.map(async ([label,sql])=>({label,value:await count(pool,sql)}))):a.counts.map(([label])=>({label,value:null}))})));
 let fc=null;
 if(firecrawl){
  try{
   const d=await firecrawl();
   fc={status:d.status,active_key:d.active_key||null,failover:d.failover||null,
    accounts:Array.isArray(d.accounts)?d.accounts.map(a=>({label:a.label,active:a.active,remaining:a.credits?.remaining??null,status:a.credits?.status||null,last_verified:a.last_verified||null})):null,
    today:d.daily?.used??null,month:d.monthly?.used??null};
  }catch{fc={status:'UNAVAILABLE'}}
 }
 const f=areas.find(a=>a.id==='firecrawl');
 if(f&&fc){
  f.counts=(fc.accounts||[]).map(a=>({label:(a.label==='BACKUP'?'Backup':'Primary')+' credits'+(a.active?' (active)':''),value:a.remaining}));
  if(fc.today!=null)f.counts.push({label:'Requests today',value:fc.today});
 }
 return {generated_at:new Date().toISOString(),areas,firecrawl:fc};
}
function page(signedIn){
 const head=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ContentScale — Owner overview</title><style>
body{margin:0;background:#0f172a;color:#e2e8f0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1100px;margin:auto;padding:28px 20px}
h1{margin:0 0 4px;font-size:1.7rem}.muted{color:#94a3b8;font-size:14px}a{color:#a5b4fc}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:20px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px}
.card h2{margin:0;font-size:1.05rem}.card p{margin:0;color:#94a3b8;font-size:14px}
.nums{display:flex;flex-wrap:wrap;gap:8px}.num{flex:1 1 80px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 10px}
.num b{display:block;font-size:1.3rem;color:#fff}.num span{font-size:12px;color:#94a3b8}
.go{margin-top:auto;display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px;font-weight:700;text-align:center}
form{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;max-width:420px}input{width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box}
button{background:#4338ca;color:#fff;border:0;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer}
</style></head><body><main><h1>Owner overview</h1>`;
 if(!signedIn)return head+`<p class="muted">Sign in with your owner key (the same one as Growth admin). The session lasts 12 hours.</p>
<form id="login"><label>Admin key<input type="password" name="key" autocomplete="current-password" required></label><button>Sign in</button> <span id="msg" role="status" class="muted"></span></form>
<script>document.getElementById('login').addEventListener('submit',async function(e){e.preventDefault();var m=document.getElementById('msg');m.textContent='Signing in…';
try{var r=await fetch('/api/free-growth/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({key:e.target.key.value})});
if(r.ok){location.reload();return}var d=await r.json().catch(function(){return {}});m.textContent=d.error||'Sign-in failed.'}catch(x){m.textContent='Sign-in failed.'}});</script></main></body></html>`;
 return head+`<p class="muted" id="when">Loading today's numbers…</p><div class="grid" id="areas">${AREAS.map(a=>`<section class="card" id="area-${a.id}"><h2>${esc(a.name)}</h2><p>${esc(a.what)}</p><div class="nums"></div><a class="go" href="${esc(a.url)}">Open ${esc(a.name)} →</a></section>`).join('')}</div>
<script>(async function(){var w=document.getElementById('when');
try{var r=await fetch('/api/owner/overview',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();var d=await r.json();
d.areas.forEach(function(a){var box=document.querySelector('#area-'+a.id+' .nums');if(!box)return;box.textContent='';
a.counts.forEach(function(c){var n=document.createElement('div');n.className='num';var b=document.createElement('b');b.textContent=c.value===null||c.value===undefined?'—':String(c.value);
var s=document.createElement('span');s.textContent=c.label;n.appendChild(b);n.appendChild(s);box.appendChild(n)})});
w.textContent='Numbers as of '+new Date(d.generated_at).toLocaleString()+'. “—” means no data for that table yet.'}catch(e){w.textContent='Numbers unavailable; the links still work.'}})();</script></main></body></html>`;
}
function registerOwnerOverview(app,pool,{adminKey=adminKeyOf(process.env),firecrawl}={}){
 const headers=res=>res.set('Cache-Control','private, no-store').set('X-Robots-Tag','noindex').set('Referrer-Policy','no-referrer').set('Content-Security-Policy',"frame-ancestors 'none'");
 app.get('/owner',(req,res)=>{headers(res);res.type('html').send(page(ownerSessionValid(req,adminKey)))});
 app.get('/api/owner/overview',async(req,res)=>{
  headers(res);
  if(!ownerSessionValid(req,adminKey))return res.status(404).json({success:false,error:'Not found'});
  try{res.json({success:true,...await overview(pool,{firecrawl})})}catch{res.status(503).json({success:false})}
 });
}
module.exports={registerOwnerOverview,overview,AREAS};
