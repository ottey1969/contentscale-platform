<?php
/**
 * Plugin Name: ContentScale Growth Elementor Draft Bridge
 * Description: Authenticated, draft-only Elementor page cloning for ContentScale Growth.
 * Version: 0.1.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }
function csgd_hash($v) { return hash('sha256', is_string($v) ? $v : ''); }
function csgd_error($id,$message,$status) { return new WP_Error($id,$message,array('status'=>$status)); }
function csgd_permission($request) {
 $id=absint($request->get_param('source_id'));
 if (!$id) $id=absint($request->get_param('id'));
 return $id && current_user_can('edit_post',$id);
}
function csgd_current_source($post,$expected='') {
 if (!$post || !in_array($post->post_type,array('page','post'),true) || $post->post_status!=='publish')
  return csgd_error('GROWTH_PUBLISHED_SOURCE_REQUIRED','Published WordPress source required',409);
 $data=get_post_meta($post->ID,'_elementor_data',true);
 if (!is_string($data) || !is_array(json_decode($data,true)))
  return csgd_error('GROWTH_ELEMENTOR_SOURCE_REQUIRED','Valid Elementor JSON source required',409);
 if ($expected!=='' && csgd_hash($data)!==$expected)
  return csgd_error('GROWTH_SOURCE_CHANGED','Source changed; refresh review',409);
 return $data;
}
function csgd_source($r) {
 $id=absint($r['source_id']);$post=get_post($id);
 if (!$post || !current_user_can('edit_post',$id))return csgd_error('GROWTH_EDITOR_ACCESS_REQUIRED','Editor access required',403);
 $data=csgd_current_source($post);if(is_wp_error($data))return $data;
 return rest_ensure_response(array('id'=>$id,'type'=>$post->post_type==='page'?'pages':'posts',
  'status'=>'publish','elementor_edit_mode'=>get_post_meta($id,'_elementor_edit_mode',true),
  'elementor_data'=>$data,'sha256'=>csgd_hash($data),'modified_gmt'=>$post->post_modified_gmt));
}
function csgd_create($r) {
 $id=absint($r->get_param('source_id'));$post=get_post($id);
 if (!$post || !current_user_can('edit_post',$id))return csgd_error('GROWTH_EDITOR_ACCESS_REQUIRED','Editor access required',403);
 $hash=$r->get_param('source_sha256');
 if(!is_string($hash)||!preg_match('/^[0-9a-f]{64}$/',$hash))
  return csgd_error('GROWTH_HASH_REQUIRED','Exact original SHA-256 required',400);
 $data=csgd_current_source($post,$hash);if(is_wp_error($data))return $data;
 $draft=wp_insert_post(wp_slash(array('post_type'=>$post->post_type,'post_status'=>'draft',
  'post_title'=>'Growth review: '.$post->post_title,'post_content'=>$post->post_content,
  'post_excerpt'=>$post->post_excerpt,'post_author'=>get_current_user_id(),
  'comment_status'=>'closed','ping_status'=>'closed')),true);
 if(is_wp_error($draft))return $draft;
 // Copy only the page-builder metadata necessary to preserve the source design.
 foreach(array('_elementor_data','_elementor_edit_mode','_elementor_page_settings',
   '_elementor_template_type','_wp_page_template') as $key) {
  $value=get_post_meta($id,$key,true);
  if($value!=='' && $value!==false)update_post_meta($draft,$key,wp_slash($value));
 }
 update_post_meta($draft,'_contentscale_growth_source_id',$id);
 update_post_meta($draft,'_contentscale_growth_source_sha256',$hash);
 update_post_meta($draft,'_elementor_edit_mode','builder');
 return rest_ensure_response(array('id'=>$draft,'type'=>$post->post_type==='page'?'pages':'posts',
  'status'=>'draft','source_post_id'=>$id));
}
function csgd_write($r) {
 $id=absint($r['id']);$post=get_post($id);
 if(!$post || !current_user_can('edit_post',$id))return csgd_error('GROWTH_EDITOR_ACCESS_REQUIRED','Editor access required',403);
 if($post->post_status!=='draft')return csgd_error('GROWTH_DRAFT_ONLY','Only unpublished drafts may be changed',409);
 $sourceId=absint(get_post_meta($id,'_contentscale_growth_source_id',true));
 if(!$sourceId || !current_user_can('edit_post',$sourceId))return csgd_error('GROWTH_CLONE_REQUIRED','Verified Growth clone required',409);
 $expectedSource=get_post_meta($id,'_contentscale_growth_source_sha256',true);
 $sourceData=csgd_current_source(get_post($sourceId),$expectedSource);
 if(is_wp_error($sourceData))return $sourceData;
 $candidate=$r->get_param('elementor_data');$expected=$r->get_param('candidate_sha256');
 if(!is_string($candidate)||strlen($candidate)>3000000||!is_array(json_decode($candidate,true)))
  return csgd_error('GROWTH_CANDIDATE_INVALID','Reviewed Elementor JSON array required',400);
 if(!is_string($expected)||!preg_match('/^[a-f0-9]{64}$/',$expected)||csgd_hash($candidate)!==$expected)
  return csgd_error('GROWTH_CANDIDATE_CHANGED','Reviewed Elementor candidate hash required',409);
 // No post update and no write to the original source is permitted.
 update_post_meta($id,'_elementor_data',wp_slash($candidate));
 update_post_meta($id,'_elementor_edit_mode','builder');
 delete_post_meta($id,'_elementor_css');
 $stored=get_post_meta($id,'_elementor_data',true);
 return rest_ensure_response(array('id'=>$id,'type'=>$post->post_type==='page'?'pages':'posts',
  'status'=>'draft','candidate_sha256'=>csgd_hash($stored)));
}
function csgd_read_draft($r) {
 $id=absint($r['id']);$post=get_post($id);
 if(!$post || !current_user_can('edit_post',$id))return csgd_error('GROWTH_EDITOR_ACCESS_REQUIRED','Editor access required',403);
 if($post->post_status!=='draft'||!get_post_meta($id,'_contentscale_growth_source_id',true))
  return csgd_error('GROWTH_CLONE_REQUIRED','Verified unpublished Growth clone required',409);
 return rest_ensure_response(array('id'=>$id,'type'=>$post->post_type==='page'?'pages':'posts',
  'status'=>'draft','source_post_id'=>absint(get_post_meta($id,'_contentscale_growth_source_id',true)),
  'elementor_edit_mode'=>get_post_meta($id,'_elementor_edit_mode',true),
  'elementor_data'=>get_post_meta($id,'_elementor_data',true)));
}
add_action('rest_api_init',function() {
 $ns='contentscale-growth/v1';
 register_rest_route($ns,'/elementor/source/(?P<source_id>\d+)',
  array('methods'=>'GET','callback'=>'csgd_source','permission_callback'=>'csgd_permission'));
 register_rest_route($ns,'/elementor/draft',
  array('methods'=>'POST','callback'=>'csgd_create','permission_callback'=>'csgd_permission'));
 register_rest_route($ns,'/elementor/draft/(?P<id>\d+)/meta',
  array('methods'=>'POST','callback'=>'csgd_write','permission_callback'=>'csgd_permission'));
 register_rest_route($ns,'/elementor/draft/(?P<id>\d+)',
  array('methods'=>'GET','callback'=>'csgd_read_draft','permission_callback'=>'csgd_permission'));
});
