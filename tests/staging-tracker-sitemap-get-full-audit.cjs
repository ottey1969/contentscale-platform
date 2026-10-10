'use strict';
const fs=require('node:fs');
const code=fs.readFileSync('src/index.js','utf8');
const marker="app.get('/api/tracker-client/:token/fetch-sitemap', async (req, res) => {";
const from=code.indexOf(marker),end=code.indexOf('\n});',from);
if(from<0||end<from||end-from>5500)throw Error('Unexpected fetch sitemap route');
console.log('BEGIN SITEMAP GET SOURCE');
console.log(code.slice(from,end+4));
console.log('END SITEMAP GET SOURCE');
