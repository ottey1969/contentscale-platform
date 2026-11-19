'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
test('Free Growth does not call saved AI answers independent engine checks or rankings',()=>{
 assert.match(source,/of 5 stored answers/);
 assert.match(source,/The historical record does not identify whether each answer/);
 assert.match(source,/Firecrawl only reads public web pages; it did not independently question these AI systems/);
 assert.match(source,/The source counts are not ranking positions/);
 assert.doesNotMatch(source,/of 5 checked'\+\(x\.checked===5\?' · complete'/);
});
