'use strict';
// Run the free Growth check on its own (own domain / own Railway service):
//   DATABASE_URL=... SERPER_API_KEY=... PORT=3000 node src/growth-free/server.cjs
// The page is then served at / (and /free-growth). It needs no Tracker tables.
const express=require('express');
const {Pool}=require('pg');
const {registerFreeGrowth,freeGrowthConfig}=require('./routes.cjs');

function createFreeGrowthServer({pool,config=freeGrowthConfig(),...rest}={}){
 const app=express();
 app.set('trust proxy',1);
 app.disable('x-powered-by');
 app.use(express.json({limit:'64kb'}));
 // Embedding is controlled per access key (CSP frame-ancestors on the pages), not globally.
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');next()});
 const service=registerFreeGrowth(app,pool,{config:{...config,enabled:true},...rest});
 app.get('/',(req,res)=>res.redirect(302,'/free-growth'+(req.query.key?'?key='+encodeURIComponent(String(req.query.key).slice(0,80)):'')));
 app.get('/health',(req,res)=>res.json({ok:true}));
 return {app,service};
}

if(require.main===module){
 if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required');process.exit(1)}
 const ssl=process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false; // same as the main app
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl,max:5});
 const {app}=createFreeGrowthServer({pool});
 const port=Number(process.env.PORT)||3000;
 app.listen(port,()=>console.log('[free-growth] listening on '+port+(process.env.SERPER_API_KEY?'':' (SERPER_API_KEY missing: searches will be blocked)')));
}

module.exports={createFreeGrowthServer};
