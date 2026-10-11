'use strict';
const assert = require('node:assert/strict');
const quality = require('../src/prospect/page-quality.cjs').checkPageContent;
const wrap = text => '<html><body><main>' + text + '</main></body></html>';
const words = Array(45).fill('Genuine useful service information').join(' ');
assert.equal(quality(wrap(''), 'product').eligible, false);
assert.equal(quality(wrap('Buy'), 'product').eligible, false);
assert.equal(quality(wrap(words), 'product').eligible, true);
assert.equal(quality(wrap(words), 'service').eligible, true);
assert.equal(quality('plain text', 'other').eligible, false);
const controls = '<form>' + Array(60).fill('<label>Product options quantity shipping checkout delivery size color</label><button>Add to cart</button>').join('') + '</form>';
assert.equal(quality(wrap(controls), 'product').eligible, false, 'form-only template must not be scan eligible');
assert.equal(quality(wrap(controls + '<p>' + words + '</p>'), 'product').eligible, true, 'real product description remains eligible');

assert.equal(quality('<html><head><meta name="robots" content="noindex"></head><body><main>' + words + '</main></body></html>', 'product').eligible, false, 'noindex must not enter canonical scan');
assert.equal(quality('<html><head><meta content="noindex,follow" name="robots"></head><body><main>' + words + '</main></body></html>', 'product').eligible, false, 'reverse meta attribute order must be rejected');

// Regression: navigation, footer and checkout controls are not page content.
// These were previously mistaken for useful prospect pages.
const boilerplate = '<html><body><header>' + words + '</header><nav>' + words +
  '</nav><main><form>' + controls + '</form></main><footer>' + words + '</footer></body></html>';
assert.equal(quality(boilerplate, 'product').eligible, false,
  'header/footer/navigation and checkout controls must not qualify an empty product');
assert.equal(quality(wrap('<div id="app"></div><script>window.render()</script>'), 'service').eligible, false,
  'empty JavaScript app shell must be rejected');
assert.equal(quality(wrap('<p>' + words + '</p>'), 'product').eligible, true,
  'legitimate commercial descriptions must remain scannable');

console.log('PASS: commercial page quality tests');
