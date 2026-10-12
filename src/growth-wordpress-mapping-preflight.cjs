'use strict';
// Preflight is read-only. Never run a migration, infer missing IDs, or create a mapping.
async function inspectGrowthMappingRollout(db){
 if(!db||typeof db.query!=='function')throw Error('DATABASE_CLIENT_REQUIRED');
 const result=await db.query(`
 SELECT to_regclass('public.growth_wordpress_page_mapping') IS NOT NULL AS mapping_table_exists,
 (SELECT count(*)::int FROM tracker_pages WHERE url LIKE 'https://%') AS tracker_https_pages,
 (SELECT count(*)::int FROM tracker_case_studies WHERE status='active') AS active_case_studies,
 (SELECT count(*)::int FROM content_articles WHERE wp_post_id IS NOT NULL) AS legacy_mapped_articles
 `);
 const row=result.rows?.[0];
 if(!row)throw Error('MAPPING_PREFLIGHT_UNAVAILABLE');
 return {status:'REVIEW_REQUIRED',schema_ready:row.mapping_table_exists===true,
  tracker_https_pages:Number(row.tracker_https_pages),active_case_studies:Number(row.active_case_studies),
  legacy_mapped_articles:Number(row.legacy_mapped_articles),
  migration_applied_by_this_call:false,mapping_write_allowed:false,
  next_action:row.mapping_table_exists===true?'VERIFY_REVIEWED_MAPPINGS':'APPLY_ADDITIVE_SCHEMA_AFTER_REVIEW'};
}
module.exports={inspectGrowthMappingRollout};
