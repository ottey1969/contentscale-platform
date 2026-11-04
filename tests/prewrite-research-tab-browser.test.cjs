'use strict';
// Research Prompt tab in a real browser, on the real Pre-Write Brief markup taken from the canonical build (the
// #prewriteBriefModal block of the client Tracker page), with the two public scripts the build loads. The prompt shown
// must equal the server's prompt for the same request. Answers are labelled TEST inputs. Skips without Playwright.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
const research=require('../src/prewrite-ai-answer-research.cjs');
const {prepare}=require('../scripts/prepare-canonical-production.cjs');

function realModalMarkup(){
 const built=prepare(fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8'));
 const page=built.slice(built.indexOf('const _CLIENT_TRACKER_HTML = `'));
 const start=page.indexOf('<div class="cs-modal" id="prewriteBriefModal">'),end=page.indexOf('<div id="pwbStatus"',start);
 assert.ok(start>0&&end>start,'Pre-Write Brief modal found in the built Tracker page');
 const block=page.slice(start,end);assert.doesNotMatch(block,/\$\{/,'static markup (no server interpolation)');
 return block.replace(/\\\\/g,'\\');
}
// What the server receives from the "Analyse & create" button for these field values (same trimming, region code, clip).
function serverPrompt(f){
 const regionRaw=f.region.trim(),region=(regionRaw.match(/^([a-z]{2})\s*[—-]/i)||[null,regionRaw])[1]||regionRaw,clip=v=>String(v||'').trim().slice(0,12000);
 return research.buildPrewriteResearchPrompt(research.makePrewriteAiAnswerResearch({query:f.keyword.trim(),language:f.language.trim(),market:region,
  answers:[['google_aio','aio'],['chatgpt','chatgpt'],['perplexity','perplexity'],['claude','claude'],['copilot','copilot']].map(([e,k])=>({engine:e,answer:clip(f[k])}))}));
}
const IDS={aio:'pwbAioText',chatgpt:'pwbChatgptText',perplexity:'pwbPerplexityText',claude:'pwbClaudeText',copilot:'pwbCopilotText'};

test('Research Prompt tab on the real Pre-Write Brief markup',{skip:!chromium&&'Playwright not installed'},async()=>{
 const modal=realModalMarkup();
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>/* the Tracker page combo-box helpers, not under test */window.csComboOpen=window.csComboFilter=window.csComboToggle=function(){};</script><script defer src="/prewrite-ai-answer-research.js"></script><script defer src="/prewrite-research-tab.js"></script></head><body style="background:#0f172a;color:#e2e8f0;margin:0">'+modal.replace('class="cs-modal"','class="cs-modal" style="display:block;padding:16px;box-sizing:border-box;max-width:100%"')+'</body></html>';
 const server=http.createServer((req,res)=>{const u=req.url.split('?')[0];
  if(u==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}
  const f=path.join(__dirname,'../public',path.basename(u));if(fs.existsSync(f)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(f))}res.statusCode=404;res.end()});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
 const b=await chromium.launch();
 try{
  const ctx=await b.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  let dialogs=0;p.on('dialog',d=>{dialogs++;d.dismiss()});
  await p.goto(base);await p.waitForSelector('#cs-research-tabs');
  // 1. Visible, two clear options, inputs first.
  assert.deepEqual(await p.$$eval('#cs-research-tabs [role=tab]',l=>l.map(x=>[x.textContent,x.getAttribute('aria-selected')])),[['AI Answer Inputs','true'],['Research Prompt','false']]);
  assert.equal(await p.isVisible('#pwbAioText'),true);assert.equal(await p.isVisible('#cs-research-prompt-panel'),false);
  const fill=async f=>{for(const [k,id] of [['keyword','pwbKeyword'],['language','pwbLanguage'],['region','pwbRegion'],...Object.entries(IDS)])await p.fill('#'+id,f[k]||'')};
  const shown=async()=>p.inputValue('#cs-research-prompt-panel textarea'),status=async()=>p.textContent('#cs-research-prompt-panel .cs-rp-status');
  // 2. All five answers: the tab shows exactly the server's prompt for this request.
  const f5={keyword:'  content scaling ',language:'English',region:'nl — Netherlands',aio:'TEST google answer on content scaling https://example.org/guide',chatgpt:'TEST chatgpt answer on content scaling',perplexity:'TEST perplexity answer on content scaling',claude:'TEST claude answer on content scaling',copilot:'TEST copilot answer on content scaling'};
  await fill(f5);await p.click('#cs-research-prompt-tab');
  assert.equal(await p.isVisible('#pwbAioText'),false,'inputs hidden while the prompt tab is open');
  assert.equal(await shown(),serverPrompt(f5));assert.match(await shown(),/Target query: content scaling\n\nLanguage: English · Market: nl/);
  assert.match(await status(),/All 5 AI answers captured/);
  // 3. Three answers, live update while the prompt tab is open.
  await p.click('#cs-research-inputs-tab');await p.fill('#pwbClaudeText','');await p.fill('#pwbCopilotText','');await p.click('#cs-research-prompt-tab');
  assert.match(await status(),/3 of 5 valid AI answers\. Not checked: Claude, Microsoft Copilot/);
  assert.equal(await shown(),serverPrompt({...f5,claude:'',copilot:''}));
  // 4. No answers.
  await p.click('#cs-research-inputs-tab');for(const id of Object.values(IDS))await p.fill('#'+id,'');await p.click('#cs-research-prompt-tab');
  assert.match(await status(),/0 of 5 valid AI answers\. Paste them/);assert.equal((await shown()).match(/— NOT CHECKED\. Do not invent results/g).length,5);
  // 5. Missing keyword: said, prompt empty, copy disabled.
  await p.click('#cs-research-inputs-tab');await p.fill('#pwbKeyword','');await p.click('#cs-research-prompt-tab');
  assert.match(await status(),/Enter the target keyword first/);assert.equal(await shown(),'');assert.equal(await p.isDisabled('#cs-research-prompt-panel .cs-rp-actions button'),true);
  // 6. Long answers and unsafe URLs: identical to the server (12,000-character clip, then excerpt); no script runs.
  const fl={...f5,claude:'L'.repeat(20000)+' javascript:alert(1) <img src=x onerror=alert(2)> https://ok.example/p',copilot:'TEST copilot content scaling <script>alert(3)</script>'};
  await p.click('#cs-research-inputs-tab');await fill(fl);await p.click('#cs-research-prompt-tab');
  assert.equal(await shown(),serverPrompt(fl));assert.equal(dialogs,0);assert.doesNotMatch(await shown(),/Candidate source URLs \(NOT verified\): [^\n]*javascript:/);
  // 7. Copy: the complete prompt is on the clipboard.
  await p.click('#cs-research-prompt-panel .cs-rp-actions button');
  assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),await shown());assert.match(await p.textContent('#cs-research-prompt-panel .cs-rp-actions small'),/Copied/);
  // 8. Reopened Brief: the research saved with it (incl. an automatic Perplexity answer) shows the prompt the server used.
  const saved=research.makePrewriteAiAnswerResearch({query:'content scaling',language:'English',market:'nl',answers:[{engine:'google_aio',answer:'TEST saved google answer'},{engine:'perplexity',answer:'TEST automatic perplexity answer',source:'automatic fallback'}]});
  await p.evaluate(r=>{window._pwbCurrentBrief={prewrite_ai_answer_research:r}},saved);
  await p.click('#cs-research-inputs-tab');await p.click('#cs-research-prompt-tab');
  await p.selectOption('#cs-research-prompt-panel select','saved');
  assert.equal(await shown(),research.buildPrewriteResearchPrompt(saved));assert.match(await status(),/^Saved with the generated Brief/);
  // 8b. Validation contract: the Research Prompt pasted as the Gemini answer is flagged at the field and not counted.
  await p.evaluate(()=>{window._pwbCurrentBrief=null});
  await p.click('#cs-research-inputs-tab');await fill({...f5,keyword:'seo content optimalisatie',language:'Dutch',region:'nl — Netherlands',chatgpt:'',perplexity:'',claude:'',copilot:''});
  await p.click('#cs-research-prompt-tab');const echo=await shown();
  await p.click('#cs-research-inputs-tab');await p.fill('#pwbAioText',echo);
  assert.match(await p.textContent('#pwbAioText-cs-invalid'),/^Not counted: This is the research instruction/);
  assert.equal(await p.getAttribute('#pwbAioText','aria-invalid'),'true');
  await p.click('#cs-research-prompt-tab');
  assert.match(await status(),/^0 of 5 valid AI answers\. Invalid, not counted: Google AI Overviews \/ Gemini — This is the research instruction/);
  assert.match(await shown(),/AI answers researched: 0\/5 .*invalid: Google AI Overviews \/ Gemini/);
  assert.equal(await shown(),serverPrompt({...f5,keyword:'seo content optimalisatie',language:'Dutch',region:'nl — Netherlands',aio:echo,chatgpt:'',perplexity:'',claude:'',copilot:''}),'same as the server');
  // A real answer clears the warning.
  await p.click('#cs-research-inputs-tab');await p.fill('#pwbAioText','TEST: SEO-contentoptimalisatie is het verbeteren van webinhoud op zoekintentie.');
  assert.equal(await p.$('#pwbAioText-cs-invalid'),null);
  // 8c. "Copy search question" copies the keyword only; disabled without a keyword.
  await p.click('#cs-research-ask-copy');
  assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'seo content optimalisatie');
  assert.match(await p.textContent('#cs-research-ask .cs-ask-note'),/^Copied: "seo content optimalisatie"/);
  await p.fill('#pwbKeyword','');assert.equal(await p.isDisabled('#cs-research-ask-copy'),true);await p.fill('#pwbKeyword','content scaling');
  // 9. Keyboard: arrows switch tabs.
  await p.focus('#cs-research-prompt-tab');await p.keyboard.press('ArrowLeft');
  assert.equal(await p.getAttribute('#cs-research-inputs-tab','aria-selected'),'true');
  // 10. Duplicate initialisation: loading the script again adds nothing.
  await p.addScriptTag({url:base+'prewrite-research-tab.js?again=1'});await p.waitForTimeout(100);
  assert.equal(await p.$$eval('#cs-research-tabs',l=>l.length),1);assert.equal(await p.$$eval('#cs-research-prompt-panel',l=>l.length),1);assert.equal(await p.$$eval('#cs-research-tab-style',l=>l.length),1);
  // 11. Refresh: installed again, once.
  await p.reload();await p.waitForSelector('#cs-research-tabs');assert.equal(await p.$$eval('#cs-research-tabs',l=>l.length),1);
  // 12. Mobile: no horizontal overflow with the prompt open.
  await p.setViewportSize({width:390,height:844});await p.fill('#pwbKeyword','content scaling');await p.click('#cs-research-prompt-tab');
  assert.ok(await p.evaluate(()=>document.querySelector('#cs-research-prompt-panel').getBoundingClientRect().right<=window.innerWidth+1),'panel fits at 390px');
  assert.deepEqual(errors,[]);
 }finally{await b.close();server.close()}
});
