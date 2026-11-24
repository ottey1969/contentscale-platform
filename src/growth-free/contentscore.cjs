'use strict';
function compare(history){
 const h=Array.isArray(history)?history:[],baseline=h[0]||null,current=h[h.length-1]||null;
 const titles=x=>new Set((x?.recommendations||[]).map(r=>r.title).filter(Boolean));
 const a=titles(baseline),b=titles(current),comparable=h.length>1;
 return {baseline,current,delta:comparable?current.score-baseline.score:null,noLongerReported:comparable?[...a].filter(t=>!b.has(t)):[],remaining:comparable?[...a].filter(t=>b.has(t)):[],newlyReported:comparable?[...b].filter(t=>!a.has(t)):[]};
}
module.exports={compare};
