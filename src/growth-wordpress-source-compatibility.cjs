'use strict';
// Distinguish a rendered Tracker document from editor-side WordPress source.
// Comparing these byte-for-byte produces false identity failures.
function classifyGrowthSource(html){
 if(typeof html!=='string'||!html.trim())return 'missing';
 const trimmed=html.trim().replace(/^<!-- wp:html -->\s*/,'').replace(/\s*<!-- \/wp:html -->$/,'').trim();
 if(/^<!doctype html\b/i.test(trimmed)||/^<html\b/i.test(trimmed))return 'full_document';
 return 'content_fragment';
}
function inspectGrowthSourceCompatibility({trackerHtml,wordpressRaw}={}){
 const tracker=classifyGrowthSource(trackerHtml),wordpress=classifyGrowthSource(wordpressRaw);
 if(tracker==='missing'||wordpress==='missing')return {compatible:false,status:'SOURCE_MISSING',tracker,wordpress};
 if(tracker!==wordpress)return {compatible:false,status:'DIFFERENT_SOURCE_REPRESENTATIONS',tracker,wordpress};
 return {compatible:true,status:'SAME_REPRESENTATION_CLASS',tracker,wordpress,verified_equal:false};
}
module.exports={classifyGrowthSource,inspectGrowthSourceCompatibility};
