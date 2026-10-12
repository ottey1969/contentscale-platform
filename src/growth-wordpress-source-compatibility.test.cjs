'use strict';
const assert=require('node:assert/strict');
const {classifyGrowthSource,inspectGrowthSourceCompatibility}=require('./growth-wordpress-source-compatibility.cjs');
assert.equal(classifyGrowthSource('<!doctype html><html><body>x</body></html>'),'full_document');
assert.equal(classifyGrowthSource('<!-- wp:html -->\n<!DOCTYPE html><html></html>\n<!-- /wp:html -->'),'full_document');
assert.equal(classifyGrowthSource('<!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->'),'content_fragment');
assert.equal(inspectGrowthSourceCompatibility({trackerHtml:'<!doctype html><html></html>',wordpressRaw:'<p>Body</p>'}).status,'DIFFERENT_SOURCE_REPRESENTATIONS');
assert.equal(inspectGrowthSourceCompatibility({trackerHtml:'<p>A</p>',wordpressRaw:'<p>B</p>'}).verified_equal,false);
console.log('PASS: source representation classification does not imply content equality');
