'use strict';
const fs = require('node:fs');
const src=fs.readFileSync('src/index.js','utf8');
for (const r of ['/api/tracker-client/:token/pages/:pageId/manual-done','/api/tracker-client/:token/pages/manual-done-all']) {
  const start=src.indexOf("app.patch('"+r+"', async (req, res) => {");
  if (start<0) throw new Error('route missing '+r);
  const end=src.indexOf('\n});',start);
  const section=src.slice(start,end+4);
  if (section.length>2800) throw new Error('scope unexpectedly large');
  console.log('BEGIN CANONICAL HANDLER '+r);
  console.log(section);
  console.log('END CANONICAL HANDLER');
}
