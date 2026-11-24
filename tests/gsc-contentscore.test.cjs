'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scanResult}=require('../src/gsc-report/contentscore.cjs');
test('keeps every native recommendation, including learning and target',()=>{
 const url='https://example.com/a',all=Array.from({length:12},(_,i)=>({title:'Issue '+i,priority:'high',description:'Observed',action:'Fix',learning:'Why',target:'Goal'}));
 const out=scanResult({success:true,url,score:75,recommendations:{all}},url);
 assert.deepEqual(out.recommendations,all);assert.equal(out.score,75);assert.ok(out.scanned_at);
});
test('rejects failed, incomplete and wrong URL scans',()=>{
 const url='https://example.com/a';
 assert.throws(()=>scanResult({success:false,score:0},url));
 assert.throws(()=>scanResult({success:true,score:80},url));
 assert.throws(()=>scanResult({success:true,score:80,url:'https://example.com/b',recommendations:[]},url));
});
