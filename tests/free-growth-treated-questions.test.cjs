'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {filterTreated,questionKey}=require('../src/growth-free/treated-questions.cjs');
test('published question is removed without suppressing unrelated questions',()=>{
 const result=filterTreated({best_question:'What is GEO?',questions:[{text:'What is GEO?'},{text:'How does GEO work?',priority:'OBSERVED_GOOGLE'}]},[' what is geo ']);
 assert.equal(result.best_question,'How does GEO work?');assert.equal(result.questions.length,1);
 assert.equal(questionKey('  WHAT is GEO? '),questionKey('what is geo'));
});
test('all treated questions yield no best question',()=>{
 assert.equal(filterTreated({best_question:'Q?',questions:[{text:'Q?'}]},['q']).best_question,null);
});
