'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {prepareGrowthElementorDraft}=require('./growth-elementor-draft.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const before='<section><h1>Hudson County Roofing Services</h1><p>Existing local guidance with meaningful details for property owners.</p><img src="/hudson.jpg" alt="Roof"></section>';
const items=[{id:'outer',elType:'container',settings:{background_color:'#ffffff'},elements:[
 {id:'hero',elType:'widget',widgetType:'html',settings:{html:before}},
 {id:'image',elType:'widget',widgetType:'image',settings:{image:{url:'/roof.jpg',id:123}}}
]}];
const sourceJson=JSON.stringify(items);
const replacement='Existing local guidance with meaningful details for property owners. For an active roof leak, call to confirm an estimated time and assessment scope.';
const good={sourceJson,sourceSha256:hash(sourceJson),approved:true,edits:[{widget_id:'hero',before:'Existing local guidance with meaningful details for property owners.',after:replacement,approved:true,evidence_ref:'verified:roofing'}]};
let result=prepareGrowthElementorDraft(good);
assert.equal(result.status,'DRAFT_FOR_REVIEW',JSON.stringify(result.issues));
assert.equal(result.publish_allowed,false);
const updated=JSON.parse(result.elementor_json);
assert.equal(updated[0].settings.background_color,'#ffffff');
assert.equal(updated[0].elements[1].settings.image.url,'/roof.jpg');
assert(updated[0].elements[0].settings.html.includes(replacement));
assert(updated[0].elements[0].settings.html.includes('<img src="/hudson.jpg"'));
assert(!sourceJson.includes(replacement),'source unchanged');
for(const o of [
 {...good,approved:false},
 {...good,sourceSha256:'0'.repeat(64)},
 {...good,edits:[{...good.edits[0],evidence_ref:''}]},
 {...good,edits:[{...good.edits[0],before:'unmatched'}]},
 {...good,edits:[{...good.edits[0],after:'<script>alert(1)</script>'}]},
 {...good,edits:[{...good.edits[0],before:'<img src="/hudson.jpg" alt="Roof">',after:'<p>gone</p>'}]}
])assert.equal(prepareGrowthElementorDraft(o).status,'BLOCKED');
console.log('PASS: immutable, revision-locked Elementor draft edits preserve original CSS/widgets/images and never publish');
