'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const scanner=src.indexOf('async function runTrackerCheck(');
const a=src.indexOf("  var _scanLocale = 'us';",scanner);
const b=src.indexOf('  // ── 1. Fetch live HTML',a);
assert(scanner>0&&a>scanner&&b>a&&b-a<5500,'Canonical scan locale source boundary changed');
const code=src.slice(a,b)+"\nglobalThis.__locale={country:_scanLocale,language:_scanLang,bing:_bingMkt};";
function locale(domain){const ctx={domain};vm.runInNewContext(code,ctx,{timeout:2000});return JSON.parse(JSON.stringify(ctx.__locale));}
test('Spanish ContentScale subdomain scans in Spanish despite .site TLD',()=>assert.deepEqual(locale('es.contentscale.site'),{country:'es',language:'es',bing:'es-ES'}));
test('original .es TLD continues to use Spanish',()=>assert.deepEqual(locale('example.es'),{country:'es',language:'es',bing:'es-ES'}));
test('neutral ContentScale main site keeps existing locale fallback',()=>assert.deepEqual(locale('contentscale.site'),{country:'us',language:'en',bing:'en-US'}));
test('existing Dutch TLD locale unaffected',()=>assert.deepEqual(locale('example.nl'),{country:'nl',language:'nl',bing:'nl-NL'}));
test('lookalike domains cannot silently acquire ContentScale Spanish override',()=>assert.deepEqual(locale('es.contentscale.site.evil.example'),{country:'us',language:'en',bing:'en-US'}));
