'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {registerGrowthElementorDraftRoute}=require('./growth-elementor-draft-route.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const url='https://site.example/roof-repair/';
const trackerHtml='<article><h1>Roofing</h1><p>Existing crawl source</p></article>';
const html='<article><h1>Roofing NJ</h1><p>Existing reliable roofing advice.</p><img src="/real.jpg" alt="Roof"></article>';
const json=JSON.stringify([{id:'hero',elType:'widget',widgetType:'html',settings:{html}}]);
const state={id:11,tracker_client_id:7,profile_id:4,url,html_content:trackerHtml,serp_spy:{}};
let caseStudy=false,duplicate=false,mapped=true,credential=true,wpMissing=false,created=0,wrote=0,draft=null;
const pool={query:async(sql,args)=>{
 if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[state]};
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:7,page_id:11,source_page_url:url,
   evidence_scope:'page_verified',query:'roof repair nj',impressions:700,clicks:0,position:43,imported_at:new Date().toISOString()}]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:caseStudy?[{id:23}]:[]};
 if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
 if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:mapped?[{wordpress_post_id:2204,wordpress_url:url,source_sha256:sha(trackerHtml)}]:[]};
 if(sql.includes('FROM content_profiles'))return {rows:credential?[{id:4,wp_url:'https://site.example/',wp_user:'editor',wp_app_password:'app-password-test'}]:[]};
 if(sql.includes('FROM tracker_pages WHERE url='))return {rows:duplicate?[{id:11,tracker_client_id:7},{id:22,tracker_client_id:8}]:[{id:11,tracker_client_id:7}]};
 throw Error('Unexpected SQL '+sql);
}};
const routes={};const app={post:(path,...handlers)=>routes[path]=handlers};
const restUrl='https://site.example/wp-json/contentscale-growth/v1/elementor';
const mockFetch=async (u,options)=>{
 assert(u.startsWith(restUrl));assert(options.headers.Authorization.startsWith('Basic '));
 if(wpMissing)return{ok:false,status:404};
 const path=u.slice(restUrl.length),b=options.body?JSON.parse(options.body):null;
 let result;
 if(path==='/source/2204'){result={id:2204,type:'pages',status:'publish',elementor_edit_mode:'builder',elementor_data:json};}
 else if(path==='/draft'&&options.method==='POST'){
  created++;assert.equal(b.source_id,2204);assert.equal(b.source_sha256,sha(json));
  draft={id:778,type:'pages',status:'draft',source_post_id:2204,elementor_edit_mode:'builder',elementor_data:json};
  result={id:778,type:'pages',status:'draft'};
 }else if(path==='/draft/778/meta'&&options.method==='POST'){
  wrote++;draft.elementor_data=b.elementor_data;
  result={id:778,type:'pages',status:'draft',candidate_sha256:sha(b.elementor_data)};
 }else if(path==='/draft/778'){result=draft;}
 else throw Error('Bad plugin request '+path);
 return{ok:true,json:async()=>result};
};
registerGrowthElementorDraftRoute({app,pool,verifyGrowthAdmin:(req,res,next)=>next(),fetchImpl:mockFetch});
const route=routes['/api/growth/admin/pages/:pageId/elementor-draft'].at(-1);
async function call(extra={},admin=true){
 const req={engineUser:{isAdmin:admin},params:{pageId:'11'},body:{
  client_id:7,wordpress_post_type:'pages',editor_approved:true,
  edits:[{widget_id:'hero',before:'Existing reliable roofing advice.',
   after:'Existing reliable roofing advice. Call to verify available inspection options.',
   evidence_ref:'gsc:roof repair nj',approved:true}],...extra}};
 const res={statusCode:200,headers:{},
  status(x){this.statusCode=x;return this},set(k,v){this.headers[k]=v;return this},
  json(x){this.body=x;return this}};
 await route(req,res);return res;
}
(async()=>{
 let r=await call();
 assert.equal(r.statusCode,201,JSON.stringify(r.body));
 assert.equal(r.body.status,'ELEMENTOR_DRAFT_VERIFIED');
 assert.equal(r.body.publication_allowed,false);
 assert.equal(r.body.source_unchanged,true);
 assert.equal(created,1);assert.equal(wrote,1);
 assert.equal(JSON.parse(draft.elementor_data)[0].settings.html.includes('/real.jpg'),true);
 r=await call({editor_approved:false});assert.equal(r.statusCode,400);assert.equal(created,1);
 r=await call({},false);assert.equal(r.statusCode,403);assert.equal(created,1);
 r=await call({edits:[{widget_id:'hero',before:'Existing reliable roofing advice.',after:'bad',evidence_ref:'invented',approved:true}]});
 assert.equal(r.statusCode,400);assert.equal(created,1);
 r=await call({edits:[{widget_id:'hero',before:'Existing reliable roofing advice.',after:'Different',evidence_ref:'gsc:unverified query',approved:true}]});
 assert.equal(r.statusCode,409);assert.equal(created,1);
 caseStudy=true;r=await call();assert.equal(r.body.issues[0],'CASE_STUDY_LOCK');assert.equal(created,1);caseStudy=false;
 duplicate=true;r=await call();assert.equal(r.body.issues[0],'DUPLICATE_TRACKER_URL');duplicate=false;
 mapped=false;r=await call();assert.equal(r.body.issues[0],'REVIEWED_WORDPRESS_IDENTITY_REQUIRED');mapped=true;
 credential=false;r=await call();assert.equal(r.body.issues[0],'WORDPRESS_PROFILE_CREDENTIALS_REQUIRED');credential=true;
 wpMissing=true;r=await call();assert.equal(r.body.issues[0],'ELEMENTOR_PLUGIN_REQUIRED');wpMissing=false;
 console.log('PASS: actual admin route -> verified GSC -> canonical mapping -> WP Elementor draft; unauthorized/locked/absent blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
