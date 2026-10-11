'use strict';
// Require a fresh persisted snapshot before announcing an async manual Case Study scan as successful.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let src=fs.readFileSync(file,'utf8');
const a=src.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const b=src.indexOf('\n// Exact client-side scan status',a);
if(a<0||b<a||b-a>22000||Buffer.byteLength(src)<6000000)throw Error('STOP: canonical manual scan route bounds changed');
let route=src.slice(a,b);
const old="          if (snap2.rows.length) {\n            const s = snap2.rows[0];\n            _sseBroadcast({\n              type: 'check_done',";
const next="          const s=snap2.rows&&snap2.rows[0];\n          const _started=Date.parse(st&&st.startedAt||'')||0;\n          const _checked=Date.parse(s&&s.checked_at||'')||0;\n          if (s&&_started&&_checked>=_started-2000) {\n            _sseBroadcast({\n              type: 'check_done',";
if(route.includes(next)){} else if(route.split(old).length===2)route=route.replace(old,next);else throw Error('STOP: canonical snapshot broadcast changed');
const oldEnd="              ts: new Date().toISOString()\n            });\n          }\n        } catch(e2)";
const newEnd="              ts: new Date().toISOString()\n            });\n          } else {\n            const _noSnapshotMessage='Scan finished without a new snapshot. No new result was verified.';\n            if(st){st.failed=true;st.error_code='NO_NEW_SNAPSHOT';st.error=_noSnapshotMessage;}\n            _sseBroadcast({type:'check_error',pageId,domain,url:page.url,error:_noSnapshotMessage,ts:new Date().toISOString()});\n          }\n        } catch(e2)";
if(route.includes(newEnd)){} else if(route.split(oldEnd).length===2)route=route.replace(oldEnd,newEnd);else throw Error('STOP: snapshot success fallback changed');
if(!route.includes("error_code='NO_NEW_SNAPSHOT'"))throw Error('STOP: missing no-snapshot failure status');
src=src.slice(0,a)+route+src.slice(b);
fs.writeFileSync(file,src);
console.log('Manual Case Study scan emits check_done only for a new persisted snapshot');
