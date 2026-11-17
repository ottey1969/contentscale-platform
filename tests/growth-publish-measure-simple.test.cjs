'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const route=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
const cmsHtml=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
const cmsJs=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
const measurement=fs.readFileSync('src/tracker-growth-measurement.cjs','utf8');
test('Growth last step is a single CMS handoff, not a second publication form',()=>{
 assert.match(route,/<section id="growthNextAction"><h2>Step 3 · Publish and measure/);
 assert.match(route,/id="growthPublishContinue"/);
 assert.match(route,/Open CMS package → publication confirmation/);
 assert.match(route,/growthPublishState/);
 assert.doesNotMatch(route,/growthPublishForm/);
 assert.doesNotMatch(route,/growthPublishConfirm/);
 assert.match(route,/v\.page\.case_study_active/);
 assert.match(route,/req\.growth\?\.can_edit!==true/);
});
test('only an actual, saved publication reveals measurement as the next primary action',()=>{
 assert.match(route,/id="growthMeasurementCTA" hidden/);
 assert.match(ui,/async function restorePublicationRecord\(/);
 assert.match(ui,/growth\/measurement/);
 assert.match(ui,/matches\[0\]\|\|null/);
 assert.match(ui,/if\(measure\)measure\.hidden=!record/);
 assert.match(ui,/NOWC\.published=!!record/);
 assert.match(ui,/c\.published\?3:c\.written\?2/);
 assert.doesNotMatch(ui,/growthPublishConfirm/);
});
test('CMS package exposes exactly one optional publication form with correction and reminder support',()=>{
 assert.equal((cmsHtml.match(/id="publicationForm"/g)||[]).length,1);
 assert.match(cmsHtml,/publicationReminderOptions/);
 assert.match(cmsHtml,/Confirm publication → start measurement/);
 assert.match(cmsHtml,/publicationMeasurement" hidden/);
 assert.match(cmsJs,/safe\.exported=true;showPublicationForm\(payload\)/);
 assert.match(cmsJs,/finish\.scrollIntoView/);
 assert.match(cmsJs,/safe\.publicationRecorded=true/);
 assert.match(cmsJs,/go\.hidden=false/);
 assert.match(cmsJs,/publicationMeasureLink/);
 assert.match(cmsJs,/safe\.publicationId/);
});
test('measurement shows one status and keeps detailed manual GSC separate',()=>{
 assert.match(measurement,/Growth · Measure after publishing/);
 assert.match(measurement,/No action needed yet/);
 assert.match(measurement,/Optional · Search Console import and manual evidence/);
 assert.match(measurement,/Manually enter exact GSC windows/);
 assert.match(measurement,/two periods/);
});
