'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mergeHistory}=require('../src/growth-free/contentscore.cjs');
test('shared measurements deduplicate and preserve chronological baseline',()=>{
 const a={url:'https://example.com/a',score:60,scanned_at:'2026-11-20T00:00:00.000Z'},b={...a,score:80,scanned_at:'2026-11-24T00:00:00.000Z'};
 assert.deepEqual(mergeHistory(a.url,[b],[a,b],[{...a,url:'https://example.com/A'}]),[a,b]);
});
