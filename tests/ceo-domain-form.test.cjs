'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const canonical=fs.readFileSync(require('node:path').join(__dirname,'../src/index.js'),'utf8');
const server=require('../scripts/fix-ceo-domain-validation.cjs');
const forms=require('../scripts/fix-ceo-form-validation.cjs');
const effective=forms.patch(server.patch(canonical));

test('CEO form and server fixes are idempotent and syntax-safe',()=>{
 assert.equal(forms.patch(effective),effective);
 assert.equal(server.patch(effective),effective);
 assert.doesNotThrow(()=>new vm.Script(effective,{filename:'src/index.js'}));
 assert.equal(effective.split('function isCeoDomainInput(value)').length-1,2);
 assert.match(effective,/if\(!isCeoDomainInput\(urlEl\.value\)\)/);
 assert.match(effective,/if\(!isCeoDomainInput\(url\.value\)\)/);
 assert.match(effective,/code:'INVALID_WEBSITE_DOMAIN'/);
 assert.match(effective,/url:urlEl\.value/);
 assert.match(effective,/url:url\.value/);
 assert.match(effective,/badsite:'Vul een geldig hoofddomein/);
 assert.match(effective,/badsite:'Introduce un dominio principal válido/);
});
test('CEO browser validates public and private domains identically',()=>{
 const validate=vm.runInNewContext(forms.helper+';isCeoDomainInput',{URL});
 for(const value of ['contentscale.site','example.com','https://example.com/roofing','www.example.co.uk','es.contentscale.site','HTTP://example.com/'])
  assert.equal(validate(value),true,'expected valid '+value);
 for(const value of ['', '  ','example','https://','foo..com','not a domain','-bad.com','bad-.com','127.0.0.1','https://bad host.com','me@example.com'])
  assert.equal(validate(value),false,'expected invalid '+value);
});
test('Canonical server accepts a main domain and rejects malformed hostnames',()=>{
 const start=effective.indexOf('function _ceoMainWebsiteUrl(input)');
 const end=effective.indexOf('// CEO REPORT — PUBLIC/PRIVATE CANONICAL ENTRY.',start);
 assert.ok(start>0&&end>start,'canonical CEO normalizer exists');
 const normalized=vm.runInNewContext(effective.slice(start,end)+';_ceoMainWebsiteUrl',{URL});
 assert.equal(normalized('https://nl.contentscale.site/blog').url,'https://contentscale.site/');
 assert.equal(normalized('https://www.example.com/about').domain,'example.com');
 for(const bad of ['website','https://','foo..com','-bad.com','bad-.com','127.0.0.1'])
  assert.throws(()=>normalized(bad),undefined,'server rejects '+bad);
});
