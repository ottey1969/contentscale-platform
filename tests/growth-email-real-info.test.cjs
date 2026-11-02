'use strict';
// Owner 2026-11-02: "the e-mail has no real information yet". The confirmation now names the search term, each added
// section with the question it answers and the sites Google shows that answer it too, and where the page stands now.
// Sections, questions and sources are the owner's real package (proposal #26); the Search Console row is a stand-in.
const test=require('node:test'),assert=require('node:assert/strict');
const {publicationContext,confirmationMessage}=require('../src/growth-measurement-reminders.cjs');
const DB=process.env.GROWTH_E2E_DATABASE_URL;
const SECTIONS=[['How Repurposing Existing Content Helps Scale Content Production','How can repurposing existing content help scale content production?',['aprimo.com: “Content Repurposing”','textbroker.com: “Can I recycle or repurpose content?”']],
 ['How to Maintain Brand Voice and Style Consistency When Scaling Content','How can I maintain brand voice and style consistency when scaling content across multiple writers?',['jasper.ai: “1. Create a style guide”','textbroker.com: “Personas Help Guide Your Marketing Strategy”']]];
test('the confirmation carries the search term, the added sections with their reason, and the current standing',{skip:!DB&&'GROWTH_E2E_DATABASE_URL not set'},async()=>{
 const {Pool}=require('pg'),pool=new Pool({connectionString:DB});
 const T=['tracker_growth_proposals','tracker_growth_publications','tracker_gsc_queries','tracker_growth_gsc_windows','tracker_growth_gsc_country','tracker_pages'];
 try{
  await pool.query('DROP TABLE IF EXISTS '+T.join(',')+' CASCADE');
  await pool.query(`CREATE TABLE tracker_pages(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,url TEXT,gsc_clicks INT,gsc_impressions INT);
   CREATE TABLE tracker_growth_proposals(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,sections JSONB,review JSONB);
   CREATE TABLE tracker_growth_publications(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,tracker_page_id BIGINT,query TEXT,notes TEXT,published_at TIMESTAMPTZ,growth_proposal_id BIGINT);
   CREATE TABLE tracker_gsc_queries(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,page_id BIGINT,query TEXT,clicks INT,impressions INT,position NUMERIC,imported_at TIMESTAMPTZ)`);
  const page=(await pool.query("INSERT INTO tracker_pages(tracker_client_id,url,gsc_clicks,gsc_impressions) VALUES(7,'https://contentscale.site/content-scaling/',40,3000) RETURNING id")).rows[0].id;
  const prop=(await pool.query('INSERT INTO tracker_growth_proposals(tracker_client_id,sections,review) VALUES(7,$1,$2) RETURNING id',[JSON.stringify(SECTIONS.map(([h2])=>({h2,text:'x'}))),
   JSON.stringify({basis:SECTIONS.map(([h2,answers,sources])=>({h2,answers,sources}))})])).rows[0].id;
  const pub=(await pool.query("INSERT INTO tracker_growth_publications(tracker_client_id,tracker_page_id,query,notes,published_at,growth_proposal_id) VALUES(7,$1,'content scaling','Added sections.','2026-11-02T01:43:00Z',$2) RETURNING id",[page,prop])).rows[0].id;
  // Without a Search Console row for the term: the page totals are named as such.
  let ctx=await publicationContext(pool,{clientId:7,publicationId:Number(pub)});
  assert.equal(ctx.query,'content scaling');assert.equal(ctx.sections.length,2);
  assert.deepEqual(ctx.sections[0].hosts,['aprimo.com','textbroker.com']);assert.equal(ctx.baseline.source,'PAGE_TOTAL');
  await pool.query("INSERT INTO tracker_gsc_queries(tracker_client_id,page_id,query,clicks,impressions,position,imported_at) VALUES(7,$1,'Content Scaling',3,420,18.4,'2026-10-30T00:00:00Z')",[page]);
  ctx=await publicationContext(pool,{clientId:7,publicationId:Number(pub)});
  assert.deepEqual([ctx.baseline.source,ctx.baseline.clicks,ctx.baseline.impressions,ctx.baseline.position],['TRACKER_QUERY',3,420,18.4]);
  const m=confirmationMessage({emails:['owner@example.com'],url:'https://contentscale.site/content-scaling/',publishedAt:'2026-11-02T01:43:00Z',notes:'Added sections.',gscAvailable:true,lang:'en',ctx});
  const t=m.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.match(t,/The search term we worked on: “content scaling”/);
  assert.match(t,/What was added to your page How Repurposing Existing Content Helps Scale Content Production Answers the question: “How can repurposing existing content help scale content production\?”\. Pages that Google shows for this search answer it too: aprimo\.com, textbroker\.com\./);
  assert.match(t,/Where your page stands in Google now The latest Google numbers we have for this search \(30 October 2026\): shown 420 times, clicked 3 times, average position 18\.4/);
  assert.doesNotMatch(t,/What changed: Added sections/,'the section list replaces the short note');
  const nl=confirmationMessage({emails:['owner@example.com'],url:'https://contentscale.site/content-scaling/',publishedAt:'2026-11-02T01:43:00Z',gscAvailable:true,lang:'nl',ctx}).html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.match(nl,/De zoekterm waaraan we werkten: “content scaling”/);assert.match(nl,/Waar uw pagina nu staat in Google De laatste Google-cijfers die we voor deze zoekopdracht hebben \(30 oktober 2026\): 420 keer getoond, 3 keer aangeklikt/);
  // Nothing known at all: it says when the numbers will be read, never a zero.
  const none=confirmationMessage({emails:['o@e.com'],url:'https://contentscale.site/x/',publishedAt:'2026-11-02T01:43:00Z',gscAvailable:true,lang:'en',ctx:{query:'x',sections:[],baseline:null}}).html;
  assert.match(none,/We do not have Google numbers for this page and search yet\. They are read on 4 December 2026 at the latest/);
 }finally{await pool.query('DROP TABLE IF EXISTS '+T.join(',')+' CASCADE').catch(()=>{});await pool.end()}
});
