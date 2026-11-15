'use strict';
// Origins allowed to call the app from a browser (CORS). The language sites
// nl. and es. host the same free tools as contentscale.site (tracker sign-up),
// so they must be allowed too. Exact matches only: no wildcards.
const STATIC_ORIGINS = [
  'https://app.contentscale.site',
  'https://contentscale.site',
  'https://www.contentscale.site',
  'https://nl.contentscale.site',
  'https://es.contentscale.site',
  'http://localhost:3000',
  'http://localhost:5173',
];

function allowedOrigins() {
  return STATIC_ORIGINS.concat(process.env.BASE_URL ? [process.env.BASE_URL] : []);
}

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && origin !== '' && allowedOrigins().includes(origin);
}

module.exports = { allowedOrigins, isAllowedOrigin };
