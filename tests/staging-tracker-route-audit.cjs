'use strict';
// Static staging audit only: NEVER import or run the application.
// Read repository text and emit non-sensitive source metadata to GitHub Actions.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['src/index.js', 'index.js', 'src/network/register-network.js'];
const needlePatterns = Object.freeze({
  tracker_client_identity: /\btracker_clients\b/g,
  tracker_page_identity: /\btracker_pages\b/g,
  tracker_workflow_event_table: /\btracker_workflow_events\b/g,
  tracker_workflow_client_event_table: /\btracker_workflow_client_events\b/g,
  tracker_workflow_sitemap_event_table: /\btracker_workflow_sitemap_events\b/g,
  manual_done: /\bmanual_done\b/g,
  idempotency_key: /\bidempotency_key\b/g,
  staging_guard: /\bCS_DEPLOYMENT_TIER\b/g,
  tracked_ddl: /\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?tracker_/gi
});
const routePattern = /\b(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"\x60])([^'"\x60\r\n]{1,260})\2/g;
function count(re, text) {
  re.lastIndex = 0;
  return [...text.matchAll(re)].length;
}
for (const file of files) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) throw new Error('Required repository source missing: ' + file);
  const source = fs.readFileSync(absolute, 'utf8');
  const counts = {};
  for (const [key, re] of Object.entries(needlePatterns)) counts[key] = count(re,source);
  routePattern.lastIndex = 0;
  const routes = [...source.matchAll(routePattern)]
    .filter(m => /tracker|network/i.test(m[3]))
    .map(m => ({
      method: m[1].toUpperCase(),
      path: m[3],
      line: source.slice(0,m.index).split('\n').length
    }));
  const manualRoutes = routes.filter(r => /manual-done|workflow|tracker-client/i.test(r.path));
  console.log(JSON.stringify({
    audit: 'staging_static_source_metadata',
    file, bytes: Buffer.byteLength(source,'utf8'),
    counts,
    tracker_routes_detected: routes.length,
    matching_routes: manualRoutes.slice(0,75),
    caveat: 'Static patterns only. Does not prove authentication, idempotency, state transitions, or startup safety.'
  }));
}
