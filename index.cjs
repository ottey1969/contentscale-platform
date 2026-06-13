// index.cjs — entry shim (repo root)
// package.json runs `node index.cjs`; this file simply boots the real server.
// Purely additive: if Railway uses a custom start command, this changes nothing;
// if it falls back to `npm start`, the deploy now works instead of crashing on a
// missing file. Single source of truth = src/index.js.
require('./src/index.js');
