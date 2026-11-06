'use strict';
// Free Growth: after the visitor publishes the change, they enter the date. About four weeks later (when Search Console has
// the full 28 days after publication: the same date rule as the Tracker, src/growth-measurement-reminders.cjs) one plain
// e-mail goes to the address of the check, in the language of the page: which two periods to export from Search Console,
// and where to upload them; the result page then shows both periods side by side. One reminder, with an unsubscribe link.
// Nothing here reads or writes Tracker data; no number is invented (without both exports the comparison says what is missing).
const { dueAt, windowsOf, localize } = require('../growth-measurement-reminders.cjs');
const gscExport = require('./gsc-export.cjs');

const DAY = 86400000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A publication date: a real day, not in the future, not more than a year ago.
function readPublishedOn(v, now = new Date()) {
  const s = String(v || '').trim();
  if (!YMD.test(s)) return { error: 'Enter the date the change went live (YYYY-MM-DD).' };
  const t = Date.parse(s + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return { error: 'This date does not exist.' };
  const today = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  if (t > today) return { error: 'Enter the date once the change is live (not a future date).' };
  if (t < today - 365 * DAY) return { error: 'The date is more than a year ago.' };
  return { value: s };
}

const LOCALE = { en: 'en-GB', nl: 'nl-NL' };
const ymd = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
const longDate = (d, lang) => new Date(ymd(d) + 'T12:00:00Z').toLocaleDateString(LOCALE[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const T = {
  en: {
    subject: 'Four weeks after your update: how is your page doing in Google?',
    hello: 'Hello,',
    intro: (url, q, d) => 'On ' + d + ' you updated <a href="' + esc(url) + '">' + esc(url) + '</a>' + (q ? ' for the search “' + esc(q) + '”' : '') + ', after the free Growth check. Four weeks have passed, so you can now see whether more people find the page in Google.',
    steps: 'What to do (about two minutes)',
    s1: 'Open Google Search Console → Performance → Search results.',
    s2: url => 'Add the filter Page → “Exact URL” → <strong>' + esc(url) + '</strong>.',
    s3: (a, b) => 'Date → Custom: <strong>' + a + ' – ' + b + '</strong> (the 4 weeks before the update). Click Export → Download CSV. You get a ZIP.',
    s4: (a, b) => 'Do the same for <strong>' + a + ' – ' + b + '</strong> (the 4 weeks after the update).',
    s5: link => 'Upload both ZIP files on <a href="' + esc(link) + '">your result page</a>. It shows how often the page was shown in Google and clicked, before and after, side by side.',
    noGsc: 'No Search Console? On the same result page you can start a new check: it compares your page again with the pages Google shows now.',
    honest: 'A change in Google is not proof that the update caused it: season, other websites and Google itself also play a part.',
    once: 'This is the only reminder for this check.',
    stop: link => 'Do not want e-mails like this? <a href="' + esc(link) + '">Stop this reminder</a>.',
    cSubject: 'Reminder set: we will e-mail you four weeks after your update',
    cIntro: (url, d, due) => 'You entered ' + d + ' as the date your update of <a href="' + esc(url) + '">' + esc(url) + '</a> went live. On ' + due + ' you get one e-mail explaining how to compare the 4 weeks before and after in Google Search Console.',
  },
  nl: {
    subject: 'Vier weken na je aanpassing: hoe doet je pagina het in Google?',
    hello: 'Hallo,',
    intro: (url, q, d) => 'Op ' + d + ' heb je <a href="' + esc(url) + '">' + esc(url) + '</a> aangepast' + (q ? ' voor de zoekopdracht “' + esc(q) + '”' : '') + ', na de gratis Growth-check. Er zijn nu vier weken voorbij, dus je kunt zien of meer mensen de pagina in Google vinden.',
    steps: 'Wat je doet (ongeveer twee minuten)',
    s1: 'Open Google Search Console → Prestaties → Zoekresultaten.',
    s2: url => 'Voeg het filter Pagina → “Exacte URL” → <strong>' + esc(url) + '</strong> toe.',
    s3: (a, b) => 'Datum → Aangepast: <strong>' + a + ' – ' + b + '</strong> (de 4 weken vóór de aanpassing). Klik op Exporteren → CSV downloaden. Je krijgt een ZIP.',
    s4: (a, b) => 'Doe hetzelfde voor <strong>' + a + ' – ' + b + '</strong> (de 4 weken na de aanpassing).',
    s5: link => 'Upload beide ZIP-bestanden op <a href="' + esc(link) + '">je resultaatpagina</a>. Daar zie je naast elkaar hoe vaak de pagina in Google werd getoond en aangeklikt, vóór en na.',
    noGsc: 'Geen Search Console? Op dezelfde resultaatpagina start je een nieuwe check: die vergelijkt je pagina opnieuw met de pagina’s die Google nu toont.',
    honest: 'Een verandering in Google bewijst niet dat de aanpassing die veroorzaakte: ook het seizoen, andere websites en Google zelf spelen mee.',
    once: 'Dit is de enige herinnering voor deze check.',
    stop: link => 'Wil je zulke e-mails niet? <a href="' + esc(link) + '">Stop deze herinnering</a>.',
    cSubject: 'Herinnering ingesteld: we mailen je vier weken na je aanpassing',
    cIntro: (url, d, due) => 'Je hebt ' + d + ' ingevuld als de datum waarop je aanpassing van <a href="' + esc(url) + '">' + esc(url) + '</a> live ging. Op ' + due + ' krijg je één e-mail met uitleg hoe je de 4 weken vóór en na vergelijkt in Google Search Console.',
  }
};
const wrap = body => '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:620px">' + body + '</div>';

function reminderMessage({ url, query, publishedOn, resultLink, stopLink, lang = 'en' }) {
  const t = T[lang] || T.en, l = T[lang] ? lang : 'en', w = windowsOf(publishedOn), d = x => longDate(x, l);
  return { subject: t.subject, html: wrap('<p>' + t.hello + '</p><p>' + t.intro(url, query, d(publishedOn)) + '</p><h3>' + t.steps + '</h3><ol><li>' + t.s1 + '</li><li>' + t.s2(url) + '</li><li>' +
    t.s3(d(w.before.start), d(w.before.end)) + '</li><li>' + t.s4(d(w.after.start), d(w.after.end)) + '</li><li>' + t.s5(resultLink) + '</li></ol><p>' + t.noGsc + '</p><p><small>' + t.honest + '</small></p><p><small>' + t.once + ' ' + t.stop(stopLink) + '</small></p>') };
}
function confirmationMessage({ url, publishedOn, stopLink, lang = 'en' }) {
  const t = T[lang] || T.en, l = T[lang] ? lang : 'en';
  return { subject: t.cSubject, html: wrap('<p>' + t.hello + '</p><p>' + t.cIntro(url, longDate(publishedOn, l), longDate(dueAt(publishedOn), l)) + '</p><p><small>' + t.stop(stopLink) + '</small></p>') };
}

// Before/after from the uploaded exports: only exports filtered on exactly this page count; each period must fall on its
// own side of the publication date. A missing period is named, never filled in.
function compareUploads(uploads, publishedOn, term) {
  if (!publishedOn) return null;
  const w = windowsOf(publishedOn), ok = (uploads || []).filter(u => u.status === 'VERIFIED_FOR_PAGE' && u.period_start && u.period_end);
  const pick = side => ok.filter(u => side === 'before' ? u.period_end < publishedOn : u.period_start > publishedOn).slice(-1)[0] || null;
  const view = u => u && { period: { start: u.period_start, end: u.period_end }, totals: u.totals || null, file_name: u.file_name,
    search_term_row: gscExport.termInExport({ queries: u.queries || [] }, term),
    matches_window: null };
  const before = view(pick('before')), after = view(pick('after'));
  if (before) before.matches_window = before.period.start === w.before.start && before.period.end === w.before.end;
  if (after) after.matches_window = after.period.start === w.after.start && after.period.end === w.after.end;
  const missing = [!before && 'before', !after && 'after'].filter(Boolean);
  return { published_on: publishedOn, windows: w, before, after, missing, ready: !missing.length,
    note: 'Search Console numbers for this exact page, 4 weeks before and after the update. A change is not proof that the update caused it.' };
}

function brevo(fetchImpl) {
  return ({ to, subject, html }) => {
    const key = process.env.BREVO_API_KEY; if (!key || typeof fetchImpl !== 'function') return Promise.resolve(false);
    return fetchImpl('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': key }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ to: to.map(email => ({ email })), sender: { email: process.env.FROM_EMAIL || 'info@contentscale.site', name: process.env.SENDER_NAME || 'ContentScale Growth' }, subject, htmlContent: html }) })
      .then(r => !!(r && r.ok)).catch(() => false);
  };
}
// The language of the page: the one chosen for the check, else the one the research used (the page's html lang).
const languageOf = row => String((row.market && row.market.language) || row.hl || (row.report && row.report.search_discovery && row.report.search_discovery.search_locale && row.report.search_discovery.search_locale.hl) || 'en').toLowerCase().slice(0, 3);
const modelFor = model => model === undefined ? (() => { try { return require('../growth-task-meaning.cjs').geminiModel(); } catch (e) { return null; } })() : model;

// Sends every due reminder once (at most 3 attempts). links: { result(row), stop(token) }.
async function sendDueFreeReminders(pool, storage, { send, links, now = new Date(), model } = {}) {
  let sent = 0, failed = 0;
  for (const row of await storage.dueReminders(pool, { now })) {
    const lang = languageOf(row);
    const m = await localize(reminderMessage({ url: row.url, query: String(row.query || (row.summary && row.summary.checked && row.summary.checked.search_term) || ''), publishedOn: row.published_on,
      resultLink: links.result(row), stopLink: links.stop(row.reminder_token, row), lang: T[lang] ? lang : 'en' }), lang, { model: modelFor(model) });
    const ok = await Promise.resolve(send({ to: [row.email], subject: m.subject, html: m.html })).catch(() => false);
    await storage.markReminder(pool, { id: row.id, sent: ok });
    if (ok) sent++; else failed++;
  }
  return { sent, failed };
}

module.exports = { readPublishedOn, reminderMessage, confirmationMessage, compareUploads, sendDueFreeReminders, brevo, languageOf, modelFor, dueAt, windowsOf, T };
