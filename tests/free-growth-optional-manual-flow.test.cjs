'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
assert.match(source,/AI answers already saved.*no need to paste/i,'Saved AI answers must not invite duplicate manual pastes');
// Owner 2026-11-20: no "Continue to the complete editor brief" link any more; the brief sits at the bottom and step 1 says
// choosing is only needed for Write with AI.
assert.match(source,/Only needed if you want AI to write the text/,'Choosing topics is only needed for Write with AI, not for the brief');
assert.match(source,/id="briefExport"/,'The complete brief stays available without choosing anything');
assert.match(source,/function automaticDraftIds\(/,'Approved suggested draft topics must be computed automatically');
assert.match(source,/savedIds\.size===0.*automaticDraftIds/s,'Use automatic selection only when visitor has not made a selection');
assert.match(source,/verified=blocked\|\|unchanged\?\[\]/,'A NO_CHANGE verdict must never offer H2s as verified additions');
console.log('PASS Free Growth optional manual research and no-change safety flow');
