'use strict';
const fs=require('fs'),path=process.argv[2]||'src/index.js';
let src=fs.readFileSync(path,'utf8');
const anchor="app.get('/api/tracker-client/:token/pages/:pageId/case-study'";
if(src.includes("registerGrowthCockpit(app,pool)")){console.log('Growth Cockpit already registered');process.exit(0)}
const at=src.indexOf(anchor);if(at<0)throw Error('Canonical Tracker Case Study route anchor changed');
const insert="require('./tracker-growth-cockpit.cjs').registerGrowthCockpit(app,pool);\n";
src=src.slice(0,at)+insert+src.slice(at);
fs.writeFileSync(path,src);console.log('Registered read-only Growth Cockpit in canonical Tracker server');
