'use strict';

// Pure classifier: does not fetch, scan, write, or execute external code.
function checkPageContent(html, type = 'other') {
  const source = String(html || '');
  if (!/<html\b|<body\b|<main\b|<article\b/i.test(source)) {
    return { eligible: false, reason: 'not_html' };
  }
  if (/<meta\b(?=[^>]*name\s*=\s*["']?robots\b)(?=[^>]*content\s*=\s*["'][^"']*noindex)[^>]*>/i.test(source)
    || /<meta\b(?=[^>]*content\s*=\s*["'][^"']*noindex)(?=[^>]*name\s*=\s*["']?robots\b)[^>]*>/i.test(source)) {
    return { eligible: false, reason: 'noindex' };
  }
  let body = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || '';
  body = body.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|button|select|option|label)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  const minWords = type === 'product' ? 30 : type === 'homepage' ? 20 : 20;
  if (words < minWords) return { eligible: false, reason: 'thin_or_empty', words };
  return { eligible: true, reason: 'usable_content', words };
}
module.exports = { checkPageContent };
