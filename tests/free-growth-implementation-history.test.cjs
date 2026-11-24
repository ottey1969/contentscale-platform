'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {noteSuggestion}=require('../src/growth-free/publication-note.cjs');
test('selected and drafted topics alone are not implementation evidence',()=>{
 assert.equal(noteSuggestion({selected_item_ids:['a'],summary:{gaps:{items:[{id:'a',title:'Draft topic'}]}},written:{sections:[{item_id:'a',h2:'Draft heading'}]}}),'');
});
test('confirmed editor tasks produce an explicitly attributed suggestion',()=>{
 assert.match(noteSuggestion({implementation:{a:{title:'Add FAQ',done:true},b:{title:'Other',done:false}}},'nl'),/Add FAQ/);
 assert.doesNotMatch(noteSuggestion({implementation:{a:{title:'Add FAQ',done:true},b:{title:'Other',done:false}}},'nl'),/Other/);
});
