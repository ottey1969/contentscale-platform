'use strict';
// Build-time patch: enrich regular Pre-Write competitor research only.
const marker='const _pwbContentReader=';
function patch(source){
 if(source.includes(marker))return source;
 const anchor='    const compScrapes = await Promise.all(top10.map(e => scrapeBodyText(e.url, 6000)));';
 if(source.split(anchor).length!==2)throw Error('PREWRITE_FIRECRAWL_COMPETITOR_ANCHOR');
 const replacement=[
 "    const _pwbContentReader=(!_pwbNetworkAuthorized&&!_pwbSyntheticNetworkTracker&&!(req.query&&String(req.query.networkEmbed)==='1')&&process.env.FREE_GROWTH_FIRECRAWL_ENABLED==='true'&&process.env.FIRECRAWL_API_KEY)",
 "      ?require('./prewrite-research-reader.cjs').createPrewriteResearchReader():null;",
 "    const compScrapes = await Promise.all(top10.map(async e=>{",
 "      if(!_pwbContentReader)return scrapeBodyText(e.url,6000);",
 "      try{",
 "        const result=await _pwbContentReader.read(e.url);",
 "        const text=require('./growth-automatic-analysis.cjs').plain(result.content.html);",
 "        return {text:text.slice(0,6000),wordCount:text?text.split(/\\s+/).length:0,status:result.native.status,fullHtml:result.native.html,contentHeadings:result.headings,contentProvenance:result.provenance};",
 "      }catch(_e){return {text:'',status:0,error:'PUBLIC_RESEARCH_READ_UNAVAILABLE'};}",
 "    }));"
 ].join('\n');
 let out=source.replace(anchor,()=>replacement);
 const summary="      return \x60RANK \x24{e.rank}: \x24{e.domain}\\n  Exact URL: \x24{e.url}\\n  Title: \"\x24{e.title || ''}\"\\n  Snippet: \"\x24{(e.snippet || '')}\"\\n  Word count: \x24{sc.wordCount || '?'}\\n  Schema detected: \x24{schema.length ? schema.join(', ') : 'none'}\\n  Body excerpt: \x24{body || '(not captured)'}\x60;";
 if(out.split(summary).length!==2)throw Error('PREWRITE_FIRECRAWL_SUMMARY_ANCHOR');
 out=out.replace(summary,()=>summary.slice(0,-2)+"\x24{sc.contentHeadings?'\\n  Observed H2/H3: '+JSON.stringify({h2:sc.contentHeadings.h2,h3:sc.contentHeadings.h3})+'\\n  Content source: '+sc.contentProvenance.content_source:''}\x60;");
 const save="    _pwbStage='persistence';\n    const _saveConn=await pool.connect();";
 if(out.split(save).length!==2)throw Error('PREWRITE_FIRECRAWL_SAVE_ANCHOR');
 return out.replace(save,()=> "    if(_pwbContentReader)brief.research_reader={..._pwbContentReader.stats};\n"+save);
}
module.exports={patch};
