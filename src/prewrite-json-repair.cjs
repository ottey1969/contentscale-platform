'use strict';
// Pre-Write Brief: Gemini's JSON for a full Brief is long (up to 16k tokens). Live 2026-11-13 a Spanish Brief failed with
// "Gemini answered, but the Prewrite JSON could not be parsed safely" after all research was paid for. Two causes:
// the answer stopped at the token limit (MAX_TOKENS: the JSON is cut off), or one string was not escaped.
// closeTruncatedJson keeps everything that was complete, drops the half-written last value and closes the open
// objects and arrays. The Brief's own completeness and quality gates then decide, exactly as for any other Brief:
// missing fields are reported (NOT PASSED with a saved diagnostic), never invented here.
function closeTruncatedJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  const stack = [];
  let inStr = false, esc = false, lastSafe = -1, safeStack = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) return s.slice(start, i + 1); // complete object: nothing to close
      lastSafe = i; safeStack = stack.slice(); continue;
    }
    // After a comma the previous member/element is complete.
    if (ch === ',') { lastSafe = i - 1; safeStack = stack.slice(); }
  }
  if (lastSafe < 0 || !safeStack) return null;
  let body = s.slice(start, lastSafe + 1).replace(/,\s*$/, '');
  for (let k = safeStack.length - 1; k >= 0; k--) body += safeStack[k] === '{' ? '}' : ']';
  return body;
}

// Parse in the order: as is, the existing light repair (control characters, trailing commas), then truncation closing.
function parseBriefJson(rawText, lightRepair) {
  const text = String(rawText || '');
  const m = text.match(/\{[\s\S]*\}/);
  const tries = [];
  if (m) { tries.push(['as_is', m[0]]); if (lightRepair) tries.push(['light_repair', () => lightRepair(m[0])]); }
  tries.push(['closed_truncation', () => { const c = closeTruncatedJson(lightRepair ? lightRepair(text.slice(text.indexOf('{'))) : text); return c; }]);
  for (const [how, get] of tries) {
    try { const src = typeof get === 'function' ? get() : get; if (!src) continue; const obj = JSON.parse(src); if (obj && typeof obj === 'object' && !Array.isArray(obj)) return { obj, how }; } catch (e) {}
  }
  return { obj: null, how: null };
}

module.exports = { closeTruncatedJson, parseBriefJson };
