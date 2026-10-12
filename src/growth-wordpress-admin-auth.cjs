'use strict';
// Admin authorization reused for Growth-only read-only routes.
// Matches the active super_admins session-token contract; no engine-code access.
function createGrowthAdminMiddleware(pool){
 if(typeof pool?.query!=='function')throw Error('DATABASE_CLIENT_REQUIRED');
 return async function verifyGrowthAdmin(req,res,next){
  const key=req.headers?.['x-admin-key'];
  if(typeof key!=='string'||!key.trim())return res.status(401).json({success:false,issues:['ADMIN_SESSION_REQUIRED']});
  try{
   const found=await pool.query('SELECT id FROM super_admins WHERE session_token=$1 AND is_active=TRUE LIMIT 1',[key]);
   if(found.rows?.length!==1)return res.status(403).json({success:false,issues:['ADMIN_SESSION_INVALID']});
   req.engineUser={isAdmin:true,adminId:Number(found.rows[0].id)};
   next();
  }catch{return res.status(503).json({success:false,issues:['ADMIN_AUTH_CHECK_UNAVAILABLE']});}
 };
}
module.exports={createGrowthAdminMiddleware};
