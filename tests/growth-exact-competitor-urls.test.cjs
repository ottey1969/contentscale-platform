'use strict';
// Regression: editors must see exact source URLs, never a shortened host-only competitor label.
// This view is research-only; URLs are never inserted into the proposed published copy.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path');

function render(report) {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.className = ''; this.href = ''; this.target = ''; this.rel = ''; }
    appendChild(node) { this.children.push(node); return node; }
  }
  const root = new Node('root'), window = {};
  const source = fs.readFileSync(path.join(__dirname, '../public/growth-competitor-overview.js'), 'utf8');
  vm.runInNewContext(source, { window, URL, document: { createElement: tag => new Node(tag) } });
  assert.equal(window.renderGrowthCompetitorOverview(report, root), true);
  const all = [];
  function visit(n) { all.push(n); n.children.forEach(visit); }
  visit(root);
  return all;
}

test('exact observed URL appears alongside every competitor section and ranking page', () => {
  const url = 'https://roofing.example/emergency-roof-repair-nj/?source=google';
  const report = {
    status: 'OBSERVED', query: 'emergency roof repair NJ', ranking_pages_read: 1,
    length: { this_page_words: 200, this_page_h2: 3, ranking_pages_median_words: 300, ranking_pages_median_h2: 4 },
    elements_they_have_and_this_page_lacks: [], structured_data_they_have_and_this_page_lacks: [],
    topics_status: 'GROUPED',
    topics: [{ topic: 'Emergency tarping', ranking_pages: 1, this_page: 'NO',
      sections: [{ host: 'roofing.example', url, position: 2, heading: 'Tarping during storms' }] }],
    ungrouped_sections: [{ host: 'roofing.example', url, position: 2, heading: 'What to do now' }],
    ranking_pages: [{ url, serp_position: 2, elements: { words: 300, h2: 4, structured_data: [] } }]
  };
  const all = render(report);
  const anchors = all.filter(x => x.tag === 'a');
  assert.ok(anchors.length >= 3, 'URLs shown in topic examples, ungrouped sections and ranking pages');
  assert.ok(anchors.every(x => x.href === url && x.textContent === url), 'full path/query must be readable, not just the hostname');
  assert.ok(anchors.every(x => x.target === '_blank' && /noopener/.test(x.rel)));
});

test('untrusted or unavailable URLs remain plain text and never become a clickable script link', () => {
  const all = render({ status: 'OBSERVED', query: 'roof repair', ranking_pages_read: 1,
    length: {}, elements_they_have_and_this_page_lacks: [], structured_data_they_have_and_this_page_lacks: [],
    topics_status: 'NOT_GROUPED_NO_MODEL', topics: null, ungrouped_sections: [],
    ranking_pages: [{ url: 'javascript:alert(1)', host: 'invalid.example', elements: { structured_data: [] } }]
  });
  assert.equal(all.filter(x => x.tag === 'a').length, 0);
});
