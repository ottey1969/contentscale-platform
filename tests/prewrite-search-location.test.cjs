'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fromGoogle,discoverCustomerQuestions}=require('../src/growth-customer-questions.cjs');
const {registerPrewriteCustomerQuestion}=require('../src/prewrite-customer-question.cjs');
test('New Jersey location is transmitted to Serper search and shown in request provenance',async()=>{
 const bodies=[];
 const fetchImpl=async(_url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({peopleAlsoAsk:[{question:'Who offers 24-hour emergency roof repair in New Jersey?'}]})}};
 const data=await fromGoogle({query:'24 Hour Emergency Roof Repair NJ',gl:'us',hl:'en',location:'New Jersey, United States',key:'fake',fetchImpl});
 assert.equal(bodies[0].location,'New Jersey, United States');
 assert.equal(bodies[0].gl,'us');
 assert.equal(bodies[0].hl,'en');
 assert.equal(data.searched.location,'New Jersey, United States');
});
test('choosing a location does not silently fall back to UK when New Jersey shows no Google questions',async()=>{
 const calls=[];
 const fetchImpl=async(_url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({peopleAlsoAsk:[],relatedSearches:[],suggestions:[]})}};
 const result=await discoverCustomerQuestions({keyword:'emergency roof repair',gl:'us',hl:'en',location:'New Jersey, United States',key:'fake',fetchImpl,model:null});
 assert.equal(result.google.status,'GOOGLE_NO_QUESTIONS');
 assert.ok(calls.every(c=>c.gl==='us'&&c.location==='New Jersey, United States'));
});
test('Pre-Write caches customer questions separately by search location',async()=>{
 let calls=0;const routes={};const app={get:(p,fn)=>routes[p]=fn};
 const pool={query:async()=>({rows:[{id:4}]})};
 registerPrewriteCustomerQuestion(app,pool,{discover:async({location})=>{calls++;return {questions:[{text:'Who offers emergency repair in '+location+'?',source:'GOOGLE_PEOPLE_ALSO_ASK'}],best_question:'Who offers emergency repair in '+location+'?',google:{status:'GOOGLE_QUESTIONS_FOUND'}}},model:null});
 const handler=routes['/api/tracker-client/:token/prewrite-customer-question'];
 async function ask(location){let response;const res={set(){return this},status(n){this.statusCode=n;return this},json(v){response=v;return this}};await handler({params:{token:'test'},query:{keyword:'emergency roof repair',region:'us',language:'English',location}},res);return response}
 const nj=await ask('New Jersey, United States'),ny=await ask('New York, United States'),cached=await ask('New Jersey, United States');
 assert.equal(nj.market.location,'New Jersey, United States');
 assert.notEqual(nj.best_question,ny.best_question);
 assert.equal(cached.cached,true);assert.equal(calls,2);
});
test('Pre-Write location control is visible in the AI-question form and sent in the query',()=>{
 const fs=require('node:fs');const code=fs.readFileSync(require('node:path').join(__dirname,'../public/prewrite-research-tab.js'),'utf8');
 assert.match(code,/whereInput\.id='pwbLocation'/);
 assert.match(code,/location=' \+ encodeURIComponent\(val\('pwbLocation'\)\)/);
 assert.match(code,/both Google customer questions and the full Pre-Write competitor SERP/);
});

test('Pre-Write full ranking SERP uses state location and the correct search language',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {patch}=require('../scripts/patch-prewrite-local-serp.cjs');
 const {googleMarket,serperParams}=require('../src/prewrite-local-serp.cjs');
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const built=patch(source);
 assert.equal(patch(built),built,'Build patch is idempotent');
 assert.match(built,/searchLocation:String\(\(document\.getElementById\('pwbLocation'\)/);
 assert.match(built,/searchLocation, manualAioText, manualAiEvidence/);
 assert.match(built,/body: JSON\.stringify\(_pwbLocalSerp\.serperParams\(keyword,_pwbSerpMarket,10\)\)/);
 assert.match(built,/brief\.search_scope=\{provider:'SERPER_GOOGLE_ORGANIC'/);
 assert.match(built,/requested_location:_pwbSerpLocation\|\|null/);
 assert.doesNotMatch(built,/hl:glParam,gl:glParam/);
 const nj=googleMarket({region:'us',language:'English',location:'New Jersey, United States'});
 assert.deepEqual(serperParams('24 Hour Emergency Roof Repair NJ',nj,10),{
  q:'24 Hour Emergency Roof Repair NJ',num:10,hl:'en',gl:'us',location:'New Jersey, United States'});
 const national=serperParams('24 Hour Emergency Roof Repair NJ',googleMarket({region:'us',language:'English'}),10);
 assert.ok(!('location' in national),'Optional location does not alter country-wide search');
});
test('Pre-Write location is validated and does not silently contradict a country',()=>{
 const {googleMarket}=require('../src/prewrite-local-serp.cjs');
 assert.equal(googleMarket({region:'us',language:'English',location:'NJ'}).location,'New Jersey, United States');
 assert.throws(()=>googleMarket({region:'nl',language:'Dutch',location:'New Jersey, United States'}),/PREWRITE_LOCATION_COUNTRY_MISMATCH/);
 assert.throws(()=>googleMarket({region:'us',language:'English',location:'https://example.com'}),/INVALID_PREWRITE_SEARCH_LOCATION/);
});
