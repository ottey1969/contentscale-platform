'use strict';
// GitHub Actions disposable full-app smoke only. Network egress is deliberately denied.
// Local PostgreSQL and localhost health probes remain available.
const net=require('node:net');
const rawConnect=net.Socket.prototype.connect;
const local=h=>!h||['127.0.0.1','localhost','::1','[::1]'].includes(String(h).toLowerCase());
net.Socket.prototype.connect=function(...args){
 let host='';
 if(args[0]&&typeof args[0]==='object')host=args[0].host||args[0].hostname||'';
 else if(typeof args[0]==='number'&&typeof args[1]==='string')host=args[1];
 if(!local(host))throw Error('STAGING-CI-EGRESS-DENIED: '+String(host).slice(0,70));
 return rawConnect.apply(this,args);
};
globalThis.fetch=async()=>{throw Error('STAGING-CI-EXTERNAL-FETCH-DENIED')};
