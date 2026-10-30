'use strict';
// The owner's selection and markets on a REAL PostgreSQL database: written items accumulate, the open part of the page's
// latest selection is found for the next research run, and page markets are set and removed. SYNTHETIC ids and URLs.
// Runs only against a dedicated test database (GROWTH_E2E_DATABASE_URL, name must contain "test" or "e2e").
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL||'';
const dbName=(()=>{try{return new URL(DB).pathname.slice(1)}catch{return ''}})();
if(!DB||!/test|e2e/i.test(dbName))test('selection store (PostgreSQL)',{skip:'set GROWTH_E2E_DATABASE_URL to a dedicated test database'},()=>{});
else{
const {Pool}=require('pg');
const store=require('../src/growth-selection-store.cjs');
const markets=require('../src/growth-market-store.cjs');
const pool=new Pool({connectionString:DB});
test.after(()=>pool.end());
const client=900000+Math.floor(Math.random()*90000),page=77;

test('selection: written items accumulate; the open rest of the latest selection is found for the next run',async()=>{
 const items=['q-a','q-b','s-c','s-d','s-e','s-f'].map(id=>({id,writable:true,title:id}));
 const research={focus_query:'roof repair',market:{country:'NL',confirmed:true}};
 const one=await store.saveGapList(pool,{clientId:client,targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'roof repair',list:{items,source_fingerprint:'f1',research}});
 await store.saveSelection(pool,{clientId:client,id:one.id,itemIds:items.map(x=>x.id)});
 await store.saveWritten(pool,{clientId:client,id:one.id,itemIds:['q-a','q-b']});
 await store.saveWritten(pool,{clientId:client,id:one.id,itemIds:['q-b','s-c']});
 const row=await store.getGapList(pool,{clientId:client,id:one.id});
 assert.deepEqual([...row.written_ids].sort(),['q-a','q-b','s-c']);assert.deepEqual(row.research,research);
 const two=await store.saveGapList(pool,{clientId:client,targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'roof repair',list:{items,source_fingerprint:'f1'}});
 const open=await store.getOpenSelection(pool,{clientId:client,targetPageId:page,beforeId:Number(two.id)});
 assert.equal(open.gap_list_id,Number(one.id));assert.deepEqual(open.pending,['s-d','s-e','s-f']);
 assert.equal(await store.getOpenSelection(pool,{clientId:client,targetPageId:page+1}),null);
});

test('markets: set in order, invalid codes dropped, an empty list removes the setting',async()=>{
 assert.deepEqual(await markets.setPageMarkets(pool,{clientId:client,pageId:page,countries:['nl','UK','xx','be'],language:'en'}),{countries:['NL','GB','BE'],language:'en'});
 assert.deepEqual((await markets.getPageMarkets(pool,{clientId:client,pageId:page})).countries,['NL','GB','BE']);
 assert.equal(await markets.setPageMarkets(pool,{clientId:client,pageId:page,countries:[]}),null);
 assert.equal(await markets.getPageMarkets(pool,{clientId:client,pageId:page}),null);
});
}
