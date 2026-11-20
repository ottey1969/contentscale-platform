'use strict';
// Owner 2026-11-20 (es.contentscale.site/consultor-geo/ Growth brief): "Accessibility Menu (165 words)" was advised as a
// section to shorten or move, and it was listed as unique content worth preserving. It is the accessibility plugin's
// widget, not page content. The Spanish table of contents ("📑 En esta página") and reading list ("📚 Relacionado") were
// advised the same way, because page furniture was only recognised in English.
const test=require('node:test'),assert=require('node:assert/strict');
const {isFurnitureHeading}=require('../src/growth-derived-reader-tasks.cjs');
const {buildContentPriorities}=require('../src/growth-free/content-priorities.cjs');

test('site widgets and navigation are page furniture, in English, Spanish and Dutch',()=>{
 for(const h of ['Accessibility Menu','♿ Accessibility Tools','Cookie settings','Skip to content','Main menu',
  '📑 En esta página','Índice','Tabla de contenidos','📚 Relacionado','Artículos relacionados','Contacto','Preguntas frecuentes',
  'Op deze pagina','Inhoudsopgave','Gerelateerde artikelen','Veelgestelde vragen','On this page','In this article','Related'])
  assert.ok(isFurnitureHeading(h),'furniture: '+h);
 // Real content headings stay content.
 for(const h of ['Qué entrega un proyecto de 90 días','Cómo medir el éxito GEO','Menu pricing for restaurants','Contact lens care','Related costs of a roof repair'])
  assert.ok(!isFurnitureHeading(h),'content: '+h);
});

test('the consultor-geo brief no longer advises shortening the accessibility widget or the Spanish navigation',()=>{
 const secs=[['Consultor GEO y experto en AI Overview para que la IA te cite',300],['📑 En esta página',24],['Qué entrega un proyecto de 90 días',173],
  ['Accessibility Menu',165],['📚 Relacionado',131]].map(([heading,words])=>({heading,words,excerpt:'',furniture:isFurnitureHeading(heading)}));
 const report={competitor_overview:{status:'OBSERVED',ranking_pages_read:3,this_page_sections:secs,topics:[],ungrouped_sections:[],
  ranking_pages:[{content_headings:['Servicio de consultoría GEO','Preguntas que debes hacer antes de firmar']}]}};
 const out=buildContentPriorities({summary:{query:'¿Cómo funciona el trabajo de un consultor GEO, cómo se mide la visibilidad en IA y cuánto cuesta?',gaps:{items:[],unique_content:[]}},report});
 const trimmed=out.trim.map(t=>t.heading);
 for(const h of ['Accessibility Menu','📑 En esta página','📚 Relacionado'])assert.ok(!trimmed.includes(h),'not advised: '+h);
 // A real section that no ranking page covers is still offered for review.
 assert.ok(trimmed.includes('Qué entrega un proyecto de 90 días'));
});
