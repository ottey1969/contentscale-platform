'use strict';
// Approximate lexical inventory: skip comments and JS strings/template literal bodies,
// including frontend scripts embedded in template strings. This is an AUDIT, not proof
// that every expression is a top-level startup side effect or that all effects were found.
// No code execution, app import, DB connection or provider calls.
const fs=require('node:fs');
const patterns=['setInterval','setTimeout','setImmediate','queueMicrotask','process.nextTick'];
function collect(file){
 const s=fs.readFileSync(file,'utf8');
 const lineStarts=[0];
 for(let i=0;i<s.length;i++)if(s[i]==='\n')lineStarts.push(i+1);
 const lineAt=n=>{let lo=0,hi=lineStarts.length;while(lo<hi){const m=(lo+hi)>>1;if(lineStarts[m]<=n)lo=m+1;else hi=m;}return lo;};
 const found=[];
 const stack=[{type:'code',interp:false,brace:0}];
 for(let i=0;i<s.length;i++){
  const ctx=stack.at(-1),c=s[i],n=s[i+1];
  if(ctx.type==='lineComment'){if(c==='\n')stack.pop();continue;}
  if(ctx.type==='blockComment'){if(c==='*'&&n==='/'){stack.pop();i++;}continue;}
  if(ctx.type==='single'||ctx.type==='double'){
   if(c==='\\'){i++;continue;}
   if(c===(ctx.type==='single'?"'":'"'))stack.pop();
   continue;
  }
  if(ctx.type==='template'){
   if(c==='\\'){i++;continue;}
   if(c===String.fromCharCode(96)){stack.pop();continue;}
   if(c==='$'&&n==='{'){stack.push({type:'code',interp:true,brace:1});i++;continue;}
   continue;
  }
  if(c==='/'&&n==='/'){stack.push({type:'lineComment'});i++;continue;}
  if(c==='/'&&n==='*'){stack.push({type:'blockComment'});i++;continue;}
  if(c==="'"){stack.push({type:'single'});continue;}
  if(c==='"'){stack.push({type:'double'});continue;}
  if(c===String.fromCharCode(96)){stack.push({type:'template'});continue;}
  if(ctx.interp){
   if(c==='{')ctx.brace++;
   if(c==='}'&&--ctx.brace===0){stack.pop();continue;}
  }
  if(!/[A-Za-z_$]/.test(c))continue;
  if(i>0&&/[\w$]/.test(s[i-1]))continue;
  const p=patterns.find(z=>s.startsWith(z,i));
  if(!p)continue;
  const after=s.slice(i+p.length,i+p.length+4);
  if(!/^\s*\(/.test(after))continue;
  const line=lineAt(i),start=lineStarts[line-1],end=s.indexOf('\n',start);
  const text=s.slice(start,end<0?s.length:end).trim().slice(0,240);
  found.push({line,kind:p,text});
  i+=p.length-1;
 }
 return {file,total:found.length,occurrences:found.slice(0,65)};
}
for(const file of ['src/index.js','index.js','src/network/register-network.js'])
 console.log(JSON.stringify({audit:'server_code_timer_inventory',...collect(file)}));
