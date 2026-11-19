'use strict';
const assert=require('node:assert/strict');
const {build}=require('../public/growth-complete-ai-brief.js');
const report={
 url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',
 page_content:{signals:{available:true},headings:{h2:['Emergency Roof Repair in Bergen and Hudson County, NJ']}},
 search_discovery:{target_query:'Who offers 24-hour emergency roof repair in New Jersey?',search_locale:{country:'US',hl:'en'}},
 editorial_decision_gate:{decision:'NO_CHANGE',reason:'Every shared task is covered.'},
 gap_list:{items:[{title:'Local Service Coverage for Hoboken and Hudson County',coverage:'MISSING'}]},
 ai_check:{summary:{},gap:{missing_topics:[{topic:'Local Service Coverage for Hoboken and Hudson County'}]}},
};
const output=build(report);
assert.match(output,/CONFLICT.*NO_CHANGE/i,'Must flag disagreement between no-change verdict and suggested additions');
assert.match(output,/geographic|service.area/i,'Must require geographic claim verification');
assert.match(output,/arrival.*response|response.*arrival/i,'Must distinguish customer support response from roof arrival time');
assert.match(output,/Hoboken and Hudson County/,'Must preserve observations even when flagged');
assert.match(output,/do not publish|publication.blocked/i,'Must explicitly prevent publication of unverified claims');
console.log('PASS Free Growth brief contradicting verdict and local claim regression');
