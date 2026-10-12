'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {approveGrowthWordPressMapping}=require('./growth-wordpress-mapping-approval.cjs');
const url='https://contentscale.site/a/',html='<article>Original</article>';
function fixture({duplicate=false,locked=false,wpId=43,existing=null}={}){
 const calls=[];let rolledBack=false,committed=false;
 const client={query:async(sql,args)=>{calls.push({sql,args});
 if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){if(sql==='COMMIT')committed=true;if(sql==='ROLLBACK')rolledBack=true;return {rows:[]};}
 if(sql.includes('FROM tracker_pages WHERE id='))return {rows:[{id:7,tracker_client_id:2,url,html_content:html}]};
 if(sql.includes('FROM tracker_pages WHERE url='))return {rows:duplicate?[{id:8}]:[]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:1}]:[]};
 if(sql.includes('FROM growth_wordpress_page_mapping'))return {rows:existing?[existing]:[]};
 if(sql.includes('INSERT INTO growth_wordpress_page_mapping'))return {rows:[{id:1,tracker_client_id:2,tracker_page_id:7,wordpress_post_id:43,wordpress_url:url}]};
 throw Error('Unexpected SQL: '+sql);
 },release:()=>{}};
 return {calls,committed:()=>committed,rolledBack:()=>rolledBack,
  input:{db:{connect:async()=>client},pageId:7,clientId:2,reviewedBy:'editor@example.com',approved:true,postId:43,
   readWordPressPost:async()=>({id:wpId,link:url,status:'publish',modified_gmt:'2026-10-12T10:00:00',content:{raw:html}})}};
}
(async()=>{
 let x=fixture();let r=await approveGrowthWordPressMapping(x.input);
 assert.equal(r.status,'MAPPING_REVIEWED');assert.equal(x.committed(),true);
 assert.equal(r.publication_allowed,false);assert(x.calls.some(c=>c.sql.includes('FOR UPDATE')));
 const insert=x.calls.find(c=>c.sql.includes('INSERT INTO growth_wordpress_page_mapping'));
 assert(insert,'Missing mapping insert');
 assert.match(insert.sql,/wordpress_raw_sha256/);
 assert.equal(insert.args[6],createHash('sha256').update(html).digest('hex'));
 assert.equal(insert.args[7],'editor@example.com');
 for(const variation of [{duplicate:true},{locked:true},{wpId:44},{existing:{wordpress_post_id:45,wordpress_url:url}}]){
  x=fixture(variation);r=await approveGrowthWordPressMapping(x.input);
  assert.equal(r.status,'BLOCKED');assert.equal(x.committed(),false);assert.equal(x.rolledBack(),true);
 }
 x=fixture();r=await approveGrowthWordPressMapping({...x.input,approved:false});
 assert.equal(r.status,'BLOCKED');assert.equal(x.calls.length,0);
 console.log('PASS: atomic WordPress mapping approval, explicit editor, rollback on conflicts');
})().catch(e=>{console.error(e);process.exitCode=1});
