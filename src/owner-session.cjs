'use strict';
// The owner's browser session (signed in once at Free Growth admin with GROWTH_FREE_ADMIN_KEY). Shared so the owner
// overview and the free tools recognise the same login. HttpOnly, SameSite=Strict cookie `gf_admin` = "<expiry>.<hmac>".
const crypto=require('node:crypto');
const SESSION='gf_admin';
const adminKeyOf=env=>String(env.GROWTH_FREE_ADMIN_KEY||'').length>=16?String(env.GROWTH_FREE_ADMIN_KEY):'';
const sign=(key,exp)=>crypto.createHmac('sha256',key).update('growth-free-admin|'+exp).digest('base64url');
const same=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const readCookie=(req,name)=>{for(const part of String(req.headers?.cookie||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim()}return ''};
function ownerSessionValid(req,adminKey=adminKeyOf(process.env)){
 if(!adminKey)return false;
 const [exp,mac]=readCookie(req,SESSION).split('.');
 return Number(exp)>Date.now()&&same(sign(adminKey,exp),mac);
}
module.exports={SESSION,adminKeyOf,sign,ownerSessionValid,readCookie};
