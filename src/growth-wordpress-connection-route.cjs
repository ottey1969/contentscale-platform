'use strict';
// Explicit super-admin-only WordPress connection. No credentials in responses,
// logs, query strings, URLs, or GitHub. Existing content_profiles is canonical.
function registerGrowthWordPressConnectionRoute({app,pool,verifyGrowthAdmin,fetchImpl=globalThis.fetch}={}){
 if(typeof app?.post!=='function'||typeof pool?.connect!=='function'||typeof verifyGrowthAdmin!=='function'||typeof fetchImpl!=='function')
  throw Error('GROWTH_WORDPRESS_CONNECTION_DEPENDENCIES_REQUIRED');
 // Browser-facing setup form. Password never appears in URLs or browser storage.
 app.get('/growth/wordpress/connect',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.type('html').send(`<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale · WordPress verbinden</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f6f8fb;color:#17263d;margin:0;padding:24px}main{max-width:560px;margin:45px auto;background:white;padding:32px;border:1px solid #dae2eb;border-radius:14px;box-shadow:0 8px 32px #17263d12}h1{font-size:25px;margin:0 0 12px}p{line-height:1.55;color:#45566c}label{display:block;font-weight:650;margin:18px 0 7px}input{width:100%;box-sizing:border-box;font:inherit;padding:13px;border:1px solid #b7c5d5;border-radius:8px}button{background:#137333;border:0;color:white;padding:14px 18px;font:inherit;font-weight:700;border-radius:8px;cursor:pointer;margin-top:22px;width:100%}button:disabled{opacity:.5;cursor:wait}#result{margin-top:18px;padding:12px;border-radius:8px;display:none;overflow-wrap:anywhere}#result.error{display:block;background:#fff2f2;color:#8a1c1c}#result.ok{display:block;background:#ecf8ed;color:#155724}small{color:#54677d}</style></head>
<body><main><h1>WordPress verbinden</h1><p>Verbind je bestaande WordPress-site met ContentScale Growth. Je originele artikelen blijven ongewijzigd; er wordt niets gepubliceerd.</p>
<form id="connect-form"><label for="profile">ContentScale-profiel</label><input id="profile" inputmode="numeric" type="number" min="1" value="4" required>
<label for="username">WordPress-gebruikersnaam</label><input id="username" autocomplete="username" required>
<label for="password">WordPress Application Password</label><input id="password" type="password" autocomplete="new-password" required>
<label for="admin">ContentScale-beheerderssessiesleutel</label><input id="admin" type="password" autocomplete="off" placeholder="Alleen nodig als niet automatisch herkend">
<small>Maak een Application Password aan in WordPress onder Gebruikers → Profiel. Je normale WordPress-wachtwoord wordt hier niet gebruikt. Het wachtwoord wordt niet in de browser opgeslagen.</small>
<button id="submit" type="submit">Connect &amp; Verify</button></form><div id="result" role="status" aria-live="polite"></div>
<p><small>Na een succesvolle verbinding kun je de Growth-controles uitvoeren. Sluit dit venster na gebruik.</small></p></main>
<script>
(function(){
'use strict';
var form=document.getElementById('connect-form'),btn=document.getElementById('submit'),msg=document.getElementById('result');
function key(){var manual=document.getElementById('admin').value.trim();if(manual)return manual;for(var name of ['adminToken','admin_token','adminKey','admin_key','lc_admin_key','lcAdminKey','engineAdminKey']){try{var v=localStorage.getItem(name)||sessionStorage.getItem(name);if(v)return v;}catch(e){}}return '';}
form.addEventListener('submit',async function(event){
 event.preventDefault();btn.disabled=true;btn.textContent='Checking…';msg.className='';msg.style.display='none';
 var pass=document.getElementById('password'),token=key(),profile=document.getElementById('profile').value;
 try{
 if(!token)throw Error('Geen beheerderssessie gevonden. Open deze pagina vanuit het beheerdersdashboard of vul je beheerderssessiesleutel in.');
 var response=await fetch('/api/growth/wordpress/profile/'+encodeURIComponent(profile)+'/connect',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-admin-key':token},body:JSON.stringify({username:document.getElementById('username').value,application_password:pass.value})});
 var result=await response.json();
 if(response.status===401||response.status===403)throw Error('ContentScale-beheerderssessie is niet geldig (HTTP '+response.status+'). Gebruik de geldige sessiesleutel van je ContentScale-beheeraccount; dit is niet je WordPress-wachtwoord.');
 if(!response.ok||result.success!==true)throw Error((result.issues||[]).join(', ')||'Verbinding mislukt');
 pass.value='';msg.className='ok';msg.textContent='Verbinding gecontroleerd en opgeslagen voor '+result.site_url+'. Volgende stap: WordPress-paginakoppeling controleren.';
 }catch(e){msg.className='error';msg.textContent=e.message||'Verbinding mislukt. Controleer de gegevens.';}
 finally{btn.disabled=false;btn.textContent='Connect & Verify';msg.style.display='block';}
});
})();
</script></body></html>`);
 });
 app.post('/api/growth/wordpress/profile/:profileId/connect',verifyGrowthAdmin,async(req,res)=>{
  const fail=(status,issue)=>res.status(status).json({success:false,status:'BLOCKED',issues:[issue]});
  if(req.engineUser?.isAdmin!==true||!Number.isSafeInteger(req.engineUser.adminId)||req.engineUser.adminId<=0)
   return fail(403,'VERIFIED_ADMIN_REQUIRED');
  const profileId=Number(req.params.profileId),username=req.body?.username,password=req.body?.application_password;
  if(!Number.isSafeInteger(profileId)||profileId<=0||typeof username!=='string'||!username.trim()||username.length>160||
    typeof password!=='string'||!password.trim()||password.length>512)
   return fail(400,'WORDPRESS_APPLICATION_CREDENTIALS_REQUIRED');
  // Admin cannot inject an arbitrary URL. Resolve it exclusively from canonical Tracker pages.
  let rows;
  try{
   const found=await pool.query("SELECT url FROM tracker_pages WHERE profile_id=$1 AND url LIKE 'https://%' ORDER BY id LIMIT 500",[profileId]);
   rows=found.rows||[];
  }catch{return fail(503,'CANONICAL_DOMAIN_CHECK_FAILED');}
  if(!rows.length||rows.length>=500)return fail(409,'EXACT_PROFILE_TRACKER_DOMAIN_REQUIRED');
  const origins=new Set();
  try{
   for(const row of rows){
    const url=new URL(row.url);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname))return fail(409,'INVALID_TRACKER_DOMAIN');
    origins.add(url.origin);
   }
  }catch{return fail(409,'INVALID_TRACKER_DOMAIN');}
  if(origins.size!==1)return fail(409,'PROFILE_MULTIPLE_SITE_ORIGINS');
  const origin=[...origins][0];
  // Authenticated read verifies credentials before they can become active.
  try{
   const authorization='Basic '+Buffer.from(username.trim()+':'+password).toString('base64');
   const response=await fetchImpl(origin+'/wp-json/wp/v2/users/me?context=edit',{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{Authorization:authorization,Accept:'application/json'}
   });
   if(!response.ok)return fail(409,'WORDPRESS_AUTHENTICATED_READ_FAILED');
   const me=await response.json();
   if(!Number.isSafeInteger(me?.id)||me.id<=0||!me.capabilities||
       (me.capabilities.edit_posts!==true&&me.capabilities.edit_pages!==true))
    return fail(409,'WORDPRESS_EDITOR_CAPABILITY_REQUIRED');
  }catch{return fail(409,'WORDPRESS_AUTHENTICATED_READ_FAILED');}
  let db,started=false;
  try{
   db=await pool.connect();
   await db.query('BEGIN');started=true;
   const found=await db.query('SELECT id FROM content_profiles WHERE id=$1 FOR UPDATE',[profileId]);
   if(found.rows?.length!==1)throw Error('PROFILE_NOT_FOUND');
   const current=await db.query("SELECT url FROM tracker_pages WHERE profile_id=$1 AND url LIKE 'https://%' ORDER BY id LIMIT 500",[profileId]);
   if(current.rows.length!==rows.length||current.rows.some((row,i)=>row.url!==rows[i].url))throw Error('TRACKER_PROFILE_CHANGED');
   await db.query('UPDATE content_profiles SET wp_url=$2,wp_user=$3,wp_app_password=$4 WHERE id=$1',
    [profileId,origin+'/',username.trim(),password]);
   await db.query('COMMIT');started=false;
   return res.json({success:true,status:'WORDPRESS_PROFILE_CONNECTED',profile_id:profileId,
    site_url:origin+'/',next_action:'REVIEW_VERIFIED_WORDPRESS_MAPPING',publication_allowed:false});
  }catch(error){
   if(started)try{await db.query('ROLLBACK');}catch{}
   return fail(409,['PROFILE_NOT_FOUND','TRACKER_PROFILE_CHANGED'].includes(error.message)?error.message:'WORDPRESS_PROFILE_SAVE_FAILED');
  }finally{if(db)db.release();}
 });
}
module.exports={registerGrowthWordPressConnectionRoute};
