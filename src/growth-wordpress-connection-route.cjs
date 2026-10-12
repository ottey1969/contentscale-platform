'use strict';
// Explicit super-admin-only WordPress connection. No credentials in responses,
// logs, query strings, URLs, or GitHub. Existing content_profiles is canonical.
function registerGrowthWordPressConnectionRoute({app,pool,verifyGrowthAdmin,fetchImpl=globalThis.fetch}={}){
 if(typeof app?.post!=='function'||typeof pool?.connect!=='function'||typeof verifyGrowthAdmin!=='function'||typeof fetchImpl!=='function')
  throw Error('GROWTH_WORDPRESS_CONNECTION_DEPENDENCIES_REQUIRED');
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
