'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const market = fs.readFileSync('public/growth-market-controls.js','utf8');
const growth = fs.readFileSync('public/growth-automatic-report-ui.js','utf8');

test('browser scripts parse after the Growth UI fix', () => {
 assert.doesNotThrow(() => new vm.Script(market));
 assert.doesNotThrow(() => new vm.Script(growth));
});
test('saving market settings schedules a one-shot real research run', () => {
 assert.match(market,/sessionStorage\.setItem\('growthRunAfterMarketSave:'/);
 assert.match(growth,/sessionStorage\.getItem\(afterSaveKey\)/);
 assert.match(growth,/sessionStorage\.removeItem\(afterSaveKey\)/);
 assert.match(growth,/afterSaveStamp!==null&&Date\.now\(\)-Number\(afterSaveStamp\)<120000/);
 assert.match(growth,/firstProgress\('Settings saved\. Starting the requested fresh research now…',true\);\s*run\(\)/);
 assert.match(growth,/else restore\(\)/);
});
test('first screen exposes Growth research and real AI answers, without fabricated completion', () => {
 assert.match(growth,/growthFirstResearchActions/);
 assert.match(growth,/Run Growth research now/);
 assert.match(growth,/firstBtn\.addEventListener\('click',function\(\)\{run\(\)\}\)/);
 assert.match(growth,/showAiEarly\(\);/);
 assert.match(growth,/growthAiEarly/);
 assert.match(growth,/if\(missing\.length&&box\.parentNode&&box\.parentNode\.id==='growthAiEarly'\)form\.open=true/);
 assert.match(growth,/AI systems are tracked separately/);
 assert.match(growth,/Growth research failed:/);
});

test('market settings sit immediately after the first AI research panel without cloning', () => {
 assert.match(growth,/var marketSettings=document\.getElementById\('marketSetting'\)/);
 assert.match(growth,/if\(marketSettings\)firstPanel\.insertAdjacentElement\('afterend',marketSettings\)/);
 assert.doesNotMatch(growth,/cloneNode\(/);
});
