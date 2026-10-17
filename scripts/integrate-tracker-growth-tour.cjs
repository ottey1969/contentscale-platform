'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const marker='CONTENTSCALE_DIRECT_GROWTH_TOUR_STEP_V1';
// The tour describes existing navigation only; it never triggers a scan.
const anchor='function _tourBuildSteps(){';
const extra="// CONTENTSCALE_DIRECT_GROWTH_TOUR_STEP_V1 — shared existing Tracker tour.\n"+
 "_tourSteps.push({sel:'#growthDirectNav',phase:'GROWTH',title:'Open Growth directly',text:'Use this button to open Growth at any time. Neither GSC nor a new scan or OpenBrief is required to enter. Without GSC, verified click data remains Needs access.'});\n";
function patch(s){
 if(typeof s!=='string'||s.length<5_000_000)throw Error('CANONICAL_TRACKER_REQUIRED');
 if(!s.includes('CONTENTSCALE_SHARED_TRACKER_GROWTH_NAV_V1'))throw Error('GROWTH_NAV_NOT_INTEGRATED');
 if(s.includes(marker))return {source:s,changed:false};
 if(s.split(anchor).length!==2)throw Error('TRACKER_TOUR_BUILDER_CHANGED');
 const at=s.indexOf(anchor),start=s.lastIndexOf('var _tourSteps = [',at);
 if(start<0||at-start>18000)throw Error('TOUR_STEPS_NOT_ADJACENT');
 return {source:s.replace(anchor,extra+anchor),changed:true};
}
if(require.main===module){const original=fs.readFileSync(file,'utf8'),out=patch(original);
 if(process.argv.includes('--write')){if(out.changed)fs.writeFileSync(file,out.source);console.log(out.changed?'GROWTH_ADDED_TO_TRACKER_TOUR':'GROWTH_TOUR_ALREADY_PRESENT');}
 else console.log(out.changed?'DRY_RUN_GROWTH_TOUR_AVAILABLE':'DRY_RUN_GROWTH_TOUR_PRESENT');
}
module.exports={patch,marker};
