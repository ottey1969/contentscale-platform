'use strict';
// Owner 2026-11-28: "de scanner is gemaakt om mensen te wijzen op serieuze wijzigingen". A page with no visible H1,
// a noindex robots meta tag or almost no main text scored 80+ (namecheap.com: no H1, 83). Chosen fix: a ceiling at 69
// for those serious faults (so never on the leaderboard), with the reason at the top of the recommendations, and a new
// scoring_version so new scores are never compared with older ones. Everything else is scored as before.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

function loadComputeScore(){
 const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
 const start=src.indexOf('const CONTENTSCORE_SCORING_VERSION');
 const fn=src.indexOf('function computeScore(',start);
 const end=src.indexOf('\nreturn result;\n}',fn)+'\nreturn result;\n}'.length;
 assert.ok(start>0&&fn>start&&end>fn,'computeScore found');
 const ctx={console:{log(){},warn(){},error(){}},URL,CONTENTSCORE_SCANNER_VERSION:'test'};
 vm.createContext(ctx);
 vm.runInContext(src.slice(start,end)+'\nthis.computeScore=computeScore;this.version=CONTENTSCORE_SCORING_VERSION;',ctx);
 return {computeScore:ctx.computeScore,version:ctx.version};
}
// A strong homepage: plenty of text, figures, links, headings, schema and metadata.
const strong={wordCount:1400,statsFound:5,expertQuoteCount:2,externalLinks:3,caseStudyCount:2,hasOrganizationSchema:true,hasSchema:true,
 h1Count:1,h1VisibleCount:1,h1Text:'Domain names and hosting',h2Count:6,listItemCount:12,avgParagraphLength:60,metaTitleLength:55,metaDescriptionLength:150,
 hasCanonical:true,hasMetaViewport:true,images:10,imagesWithAlt:10,hasOpenGraph:true,hasTwitterCard:true,robotsMeta:[]};

test('a serious fault caps the score at 69 with the reason first; a sound page keeps its score',()=>{
 const {computeScore,version}=loadComputeScore();
 assert.notEqual(version,'graaf-page-type-v2-2026.09.08','new scoring version, never compared with older scores');
 const sound=computeScore('https://example.com/',{...strong});
 assert.ok(sound.score>=75,String(sound.score));
 assert.equal(sound.score_cap.applied,false);
 for(const [why,change,reason] of [
  ['no H1',{h1Count:0,h1VisibleCount:0,h1Text:''},'NO_H1'],
  ['hidden H1',{h1IsHidden:true,h1VisibleCount:0},'H1_HIDDEN'],
  ['noindex',{robotsMeta:[{name:'robots',content:'noindex, follow'}]},'NOINDEX'],
  ['almost no text',{wordCount:90},'THIN_CONTENT']]){
  const r=computeScore('https://example.com/',{...strong,...change});
  assert.ok(r.score<=69,why+': '+r.score);
  assert.equal(r.score_cap.applied,true,why);
  assert.ok(r.score_cap.reasons.includes(reason),why);
  assert.ok(r.score_cap.uncapped_score>=r.score,why);
  assert.equal(r.quality,'average',why);
  const first=r.recommendations.all[0];
  assert.match(first.title,/Score capped at 69/,why);
  assert.equal(first.priority,'high',why);
 }
 // A page that already scores below 69 is not raised or changed by the cap.
 const weak=computeScore('https://example.com/x/',{...strong,h1Count:0,h1VisibleCount:0,wordCount:90,statsFound:0,externalLinks:0,h2Count:0,listItemCount:0,hasSchema:false,hasOrganizationSchema:false});
 assert.equal(weak.score,weak.score_cap.uncapped_score);
});
