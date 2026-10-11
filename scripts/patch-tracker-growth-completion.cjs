'use strict';
const fs=require('node:fs'),file=process.argv[2]||'src/index.js';
let s=fs.readFileSync(file,'utf8');
const a=s.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/brief-action/resolve'");
const b=s.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/brief-action/restore'",a);
if(a<0||b<=a||b-a>18000)throw Error('Canonical action resolution route moved');
let route=s.slice(a,b);
if(route.includes('buildTrackerGrowthPlan(')){console.log('Post-completion growth plan already installed');process.exit(0)}
const anchor=`        recycle_completed_actions:false
      };
    }

    await pool.query(`;
if(!route.includes(anchor))throw Error('Complete-cycle growth transition changed; refuse patch');
const replacement=`        recycle_completed_actions:false
      };
      // Growth is a distinct, evidence-based phase. Never backfill new defects or
      // automatically publish spokes when the implementation queue reaches zero.
      try{
        const growthQueries=await pool.query(\`SELECT query,clicks,impressions,position,imported_at,evidence_scope
          FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND evidence_scope='page_verified'
          ORDER BY imported_at DESC,impressions DESC LIMIT 300\`,[cr.rows[0].id,page.id]);
        const growthSitePages=await pool.query(\`SELECT url,keyword,gsc_keyword FROM tracker_pages
          WHERE tracker_client_id=$1 AND (is_active=TRUE OR is_active IS NULL) LIMIT 1000\`,[cr.rows[0].id]);
        const {buildTrackerGrowthPlan}=require('./tracker-growth-plan.cjs');
        brief.growth_loop.plan=buildTrackerGrowthPlan({page,queries:growthQueries.rows,sitePages:growthSitePages.rows});
        brief.growth_loop.next_focus=brief.growth_loop.plan.opportunities.length
          ? 'Review verified GSC ranking and distinct-intent growth opportunities; completed Brief actions remain closed.'
          : 'No verified new action; obtain fresh page-level GSC evidence before a new growth cycle.';
      }catch(growthError){
        brief.growth_loop.plan={mode:'GROWTH_NOT_DEFECTS',verified:false,opportunities:[],
          warnings:['Growth research evidence is temporarily unavailable; zero Brief actions remains valid.']};
      }
    }

    await pool.query(`;
route=route.replace(anchor,replacement);
s=s.slice(0,a)+route+s.slice(b);
fs.writeFileSync(file,s);
console.log('Complete Brief transitions to read-only verified GSC growth plan, without inventing new tasks');
