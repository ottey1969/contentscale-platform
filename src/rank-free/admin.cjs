'use strict';
// Rank tracker owner admin (owner 2026-11-12: "put the admin that was in Growth in the rank tracker"): contacts per country
// with website, keywords and tips consent, CSV, delete one, delete a selection (typed DELETE), and the usage stats.
// Same admin key as before (RANK_FREE_ADMIN_KEY, else GROWTH_FREE_ADMIN_KEY); a signed session cookie after login; every
// change needs the X-Requested-With header so a link or a form on another site cannot delete anything.
const crypto = require('crypto');
const contacts = require('../growth-free/contacts.cjs');

const COOKIE = 'rf_admin', HOURS = 12;
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

function registerRankAdmin(app, pool, { config, store, now = () => new Date() }) {
  const sign = exp => crypto.createHmac('sha256', String(config.adminKey)).update('rank-admin:' + exp).digest('hex');
  const readCookie = req => { const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };
  const sessionValid = req => { if (!config.adminKey) return false; const [exp, mac] = readCookie(req).split('.'); return Number(exp) > Date.now() && same(sign(exp), mac); };
  const keyValid = req => !!config.adminKey && same(String(req.headers['x-admin-key'] || ''), config.adminKey);
  const owner = req => sessionValid(req) || keyValid(req);
  const csrf = req => req.get('X-Requested-With') === 'rank-free-admin';
  const no = res => res.status(404).json({ success: false });
  const sel = q => ({ source: 'rank', country: String(q.country || '').toUpperCase() === 'NONE' ? 'NONE' : contacts.countryOf(q.country), tipsOnly: q.tips === '1' || q.tips === true });

  app.post('/api/rank-free/admin/login', (req, res) => {
    if (!config.adminKey || !same(String((req.body || {}).key || ''), config.adminKey)) return res.status(401).json({ success: false, error: 'Wrong key' });
    const exp = Date.now() + HOURS * 3600000;
    res.set('Set-Cookie', COOKIE + '=' + encodeURIComponent(exp + '.' + sign(exp)) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + HOURS * 3600);
    res.json({ success: true });
  });
  app.post('/api/rank-free/admin/logout', (req, res) => { res.set('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); res.json({ success: true }); });
  app.get('/api/rank-free/admin/contacts', async (req, res) => {
    if (!owner(req)) return no(res);
    try { res.set('Cache-Control', 'no-store').json({ success: true, ...(await contacts.listContacts(pool, sel(req.query))) }); }
    catch (e) { res.status(503).json({ success: false, error: 'Contacts unavailable' }); }
  });
  app.get('/api/rank-free/admin/contacts.csv', async (req, res) => {
    if (!owner(req)) return no(res);
    try { const s = sel(req.query), { rows } = await contacts.listContacts(pool, s);
      res.set('Cache-Control', 'no-store').type('text/csv').set('Content-Disposition', 'attachment; filename="rank-tracker-contacts' + (s.country ? '-' + s.country : '') + '.csv"').send(contacts.toCsv('rank', rows)); }
    catch (e) { res.status(503).send('Contacts unavailable'); }
  });
  app.post('/api/rank-free/admin/contacts/delete', async (req, res) => {
    if (!owner(req) || !csrf(req)) return no(res);
    res.json({ success: true, deleted: await contacts.deleteContact(pool, { source: 'rank', id: (req.body || {}).id }) });
  });
  app.post('/api/rank-free/admin/contacts/delete-all', async (req, res) => {
    if (!owner(req) || !csrf(req)) return no(res);
    const b = req.body || {};
    if (b.confirm !== 'DELETE') return res.status(400).json({ success: false, error: 'Type DELETE to confirm' });
    res.json({ success: true, deleted: await contacts.deleteSelection(pool, sel({ country: b.country, tips: b.tips ? '1' : '' })) });
  });
  app.get('/api/rank-free/admin/session-stats', async (req, res) => {
    if (!owner(req)) return no(res);
    res.json({ success: true, monthly_cap: config.monthlyCap, ...(await store.stats(now())) });
  });
  app.get('/rank-tracker/admin', (req, res) => {
    res.set('Cache-Control', 'no-store').set('Content-Security-Policy', "frame-ancestors 'none'").set('X-Robots-Tag', 'noindex, nofollow').type('html').send(adminPage(sessionValid(req), !!config.adminKey));
  });
  return { sessionValid };
}

function adminPage(loggedIn, configured) {
  const style = 'body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f6f8fc;color:#172337}main{max-width:1100px;margin:auto;padding:20px}.card{background:#fff;border:1px solid #d9e0eb;border-radius:12px;padding:16px;margin:14px 0}'
    + 'table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e5eaf2;padding:6px;text-align:left;vertical-align:top}button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit}'
    + 'button.ghost{background:#fff;color:#b42318;border:1px solid #b42318}input,select{font:inherit;padding:6px;border:1px solid #c8d2e0;border-radius:6px}.muted{color:#5b6b82}.chip{display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border:1px solid #d9e0eb;border-radius:999px;cursor:pointer;background:#fff}';
  if (!configured) return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rank tracker admin</title><style>' + style + '</style></head><body><main><h1>Rank tracker admin</h1><p>No admin key is set (RANK_FREE_ADMIN_KEY).</p></main></body></html>';
  if (!loggedIn) return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rank tracker admin</title><style>' + style + '</style></head><body><main><h1>Rank tracker admin</h1>'
    + '<form class="card" id="lf"><label>Admin key <input name="key" type="password" autocomplete="current-password" required></label> <button>Sign in</button> <span id="ls" class="muted"></span></form>'
    + '<script>document.getElementById("lf").onsubmit=async function(e){e.preventDefault();var r=await fetch("/api/rank-free/admin/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e.target.key.value})});if(r.ok)location.reload();else document.getElementById("ls").textContent="Wrong key"}</script></main></body></html>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rank tracker admin</title><style>' + style + '</style></head><body><main>'
    + '<h1>Rank tracker admin</h1><p class="muted">Contacts of the free rank tracker per country: website, keywords, language and tips consent. “Tips” counts only a confirmed address that did not stop the tracker. Deleting removes the account with its project, keywords and results.</p>'
    + '<div class="card" id="stats">Loading usage…</div>'
    + '<div class="card"><h2>Contacts per country</h2><div id="cc"></div><p><label>Country <input id="cCountry" size="6" placeholder="ES"></label> <label><input type="checkbox" id="cTips"> tips only</label> <button type="button" id="cLoad">Show</button> <a href="#" id="cCsv">Download CSV</a> <button type="button" class="ghost" id="cDelAll">Delete this selection…</button> <span id="cStatus" class="muted"></span></p>'
    + '<div style="overflow-x:auto"><table><thead><tr><th>Country</th><th>E-mail</th><th>Tips</th><th>Website</th><th>Keywords</th><th>Language</th><th>Confirmed</th><th>Since</th><th></th></tr></thead><tbody id="cRows"></tbody></table></div></div>'
    + '<p><a href="#" id="lo">Sign out</a></p>'
    + '<script>(function(){var $=function(i){return document.getElementById(i)},H={"X-Requested-With":"rank-free-admin","Content-Type":"application/json"};'
    + 'var e=function(x){return String(x==null?"":x).replace(/[&<>"\']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]})};'
    + 'function q(){var c=$("cCountry").value.trim().toUpperCase(),t=$("cTips").checked;return "country="+encodeURIComponent(c)+(t?"&tips=1":"")}'
    + 'async function stats(){try{var r=await (await fetch("/api/rank-free/admin/session-stats",{credentials:"same-origin"})).json();$("stats").innerHTML="<strong>Usage</strong><br>"+Object.keys(r).filter(function(k){return k!=="success"}).map(function(k){return e(k.replace(/_/g," "))+": <strong>"+e(typeof r[k]==="object"?JSON.stringify(r[k]):r[k])+"</strong>"}).join(" · ")}catch(x){$("stats").textContent="Usage unavailable"}}'
    + 'async function load(){$("cStatus").textContent="Loading…";var d=await (await fetch("/api/rank-free/admin/contacts?"+q(),{credentials:"same-origin"})).json();if(!d.success){$("cStatus").textContent=d.error||"Unavailable";return}'
    + '$("cc").innerHTML=d.countries.map(function(c){return "<span class=chip data-c=\\""+e(c.country)+"\\">"+e(c.country)+" · "+c.contacts+" ("+c.tips+" tips)</span>"}).join("")||"<span class=muted>No contacts yet.</span>";'
    + '$("cRows").innerHTML=d.rows.map(function(r){return "<tr><td>"+e(r.country||"–")+"</td><td>"+e(r.email)+"</td><td>"+(r.tips?"yes":"no")+"</td><td>"+e(r.host||"")+"</td><td>"+e((r.keywords||[]).join(", "))+"</td><td>"+e(r.hl||r.lang||"")+"</td><td>"+(r.verified_at?"yes":"no")+(r.opted_out_at?" · stopped":"")+"</td><td>"+e(String(r.created_at||"").slice(0,10))+"</td><td><button class=ghost data-id=\\""+e(r.id)+"\\" data-email=\\""+e(r.email)+"\\">Delete</button></td></tr>"}).join("");'
    + '$("cStatus").textContent=d.rows.length+" of "+d.total+" contact(s)"}'
    + '$("cLoad").onclick=load;$("cc").onclick=function(ev){var c=ev.target.closest(".chip");if(c){$("cCountry").value=c.getAttribute("data-c");load()}};'
    + '$("cRows").onclick=async function(ev){var b=ev.target.closest("button[data-id]");if(!b||!confirm("Delete all rank tracker data of "+b.getAttribute("data-email")+"?"))return;var r=await (await fetch("/api/rank-free/admin/contacts/delete",{method:"POST",credentials:"same-origin",headers:H,body:JSON.stringify({id:b.getAttribute("data-id")})})).json();$("cStatus").textContent=r.success?"Deleted":"Not deleted";load()};'
    + '$("cDelAll").onclick=async function(){var c=$("cCountry").value.trim().toUpperCase(),t=$("cTips").checked,w=prompt("Delete every contact in this selection ("+(c||"all countries")+(t?", tips only":"")+")? Type DELETE to confirm.");if(w!=="DELETE")return;'
    + 'var r=await (await fetch("/api/rank-free/admin/contacts/delete-all",{method:"POST",credentials:"same-origin",headers:H,body:JSON.stringify({country:c,tips:t,confirm:"DELETE"})})).json();$("cStatus").textContent=r.success?r.deleted+" deleted":(r.error||"Not deleted");load()};'
    + '$("cCsv").onclick=async function(ev){ev.preventDefault();var r=await fetch("/api/rank-free/admin/contacts.csv?"+q(),{credentials:"same-origin"});if(!r.ok)return;var b=await r.blob(),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="rank-tracker-contacts.csv";a.click()};'
    + '$("lo").onclick=async function(ev){ev.preventDefault();await fetch("/api/rank-free/admin/logout",{method:"POST",credentials:"same-origin"});location.reload()};stats();load()})()</script></main></body></html>';
}

module.exports = { registerRankAdmin, adminPage };
