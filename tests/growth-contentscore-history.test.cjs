'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../src/growth-free/contentscore.cjs');
test('first and last measurements are compared without claiming verified fixes',()=>{
 const a={score:60,recommendations:[{title:'A'},{title:'B'}]},b={score:80,recommendations:[{title:'B'},{title:'C'}]};
 const x=compare([a,b]);assert.equal(x.baseline,a);assert.equal(x.current,b);assert.equal(x.delta,20);assert.deepEqual(x.noLongerReported,['A']);assert.deepEqual(x.remaining,['B']);assert.deepEqual(x.newlyReported,['C']);
});
test('single scan is not proof of improvement',()=>{assert.equal(compare([{score:60,recommendations:[]}]).delta,null);assert.equal(compare([]).baseline,null)});
