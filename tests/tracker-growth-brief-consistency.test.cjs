'use strict';
// Owner analysis 2026-11-19 (Tracker Growth export for perfectroofingteam.com/24-hour-emergency-roof-repair-nj/): the
// complete brief contradicted itself — "Target market: NOT AVAILABLE" while New Jersey was searched, "Readable ranking
// pages: 0" while pages were read, "COMPLETE=0, PARTIAL=0" while topics were marked PARTLY. Each line must now say what
// the research actually used, from the field that holds it.
const test=require('node:test'),assert=require('node:assert/strict');
const {build,contentInventory}=require('../public/growth-complete-ai-brief.js');
const {prioritiesForTrackerReport}=require('../src/growth-free/content-priorities.cjs');
const f=require('./fixtures/free-growth-prt-emergency/check.json');
function report(){
 return {url:f.url,saved_at:'2026-11-19T22:00:00Z',
  editorial_decision_gate:{decision:'NO_CHANGE',focus_query:f.query},
  search_discovery:{target_query:f.query,status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',
   // No search_locale: the market came from "NJ" in the query; the scope holds what was searched.
   scope:{country:'us',language:'en',location:'New Jersey, United States',market_source:'US_STATE_IN_QUERY_KEYWORD_OR_URL'},
   competitor_fetch_summary:'9 tried: 6 readable, 2 blocked by the site (respected), 0 timed out, 1 fetched but not readable',
   competitor_fetch_log:[...Array(6)].map((_,i)=>({url:'https://r'+i+'.example/',outcome:'READABLE'})).concat([{url:'https://b1.example/',outcome:'FETCH_FAILED'},{url:'https://b2.example/',outcome:'FETCH_FAILED'},{url:'https://n.example/',outcome:'NOT_READABLE'}])},
  competitor_overview:f.report.competitor_overview,
  gap_list:{...f.summary.gaps,focus_query:f.query,evidence:{status:'ENOUGH_EVIDENCE',readable_ranking_pages:0}},
  page_content:{status:'LIVE_PUBLIC_HTTPS',signals:{available:false}},
  ai_check:{search_term:f.query,gap:f.ai_gap,summary:{checked:5}}};
}

test('target market and location come from the search that was actually run',()=>{
 const t=build(report());
 assert.match(t,/Target market: us/);
 assert.match(t,/Search location: New Jersey, United States/);
 assert.doesNotMatch(t,/Target market: NOT AVAILABLE/);
});

test('readable pages: what was fetched and what was compared are both stated',()=>{
 const t=build(report());
 assert.match(t,/Ranking pages fetched and readable: 6 of 9/);
 assert.match(t,/Ranking pages compared section by section: 6/,'the topic comparison read 6 pages (competitor_overview)');
 assert.doesNotMatch(t,/Readable ranking pages: 0/);
});

test('AI and topic coverage labels PARTLY / YES / NO are counted, not lost as UNKNOWN',()=>{
 const inv=contentInventory(report());
 const cov=Object.fromEntries(['COMPLETE','PARTIAL','MISSING'].map(k=>[k,inv.filter(x=>x.coverage===k).length]));
 assert.ok(cov.PARTIAL>=1,'“Tracing leak entry points from the attic side” is PARTLY: '+JSON.stringify(cov));
 assert.ok(cov.COMPLETE>=1,'topics found on the page count as complete: '+JSON.stringify(cov));
 assert.ok(cov.MISSING>=1,'topics not on the page count as missing: '+JSON.stringify(cov));
});

test('the complete brief starts with the same priority list as Free Growth',()=>{
 const r=report();r.content_priorities=prioritiesForTrackerReport(r);
 const t=build(r);
 const i=t.indexOf('WHAT TO PUT IN YOUR CONTENT — MOST TO LEAST IMPORTANT');
 assert.ok(i>0&&i<t.indexOf('1. TASK IDENTITY'),'first section of the brief');
 assert.match(t,/1\. .+ — (Most important|Important|Useful|Optional) · /);
});
