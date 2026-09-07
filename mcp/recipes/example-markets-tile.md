# Worked example: a Fuel-grade tile (Markets watchlist, bring your own key)

This is the ceiling, not the floor. Most of the kit teaches one idea at a time. This file is ONE complete, sealed, copy-paste tile that ties everything together: a full-screen, multi-section, responsive, on-brand surface that brings its own API key for live data, persists through the host bridge, reports one clean number into Vee, and passes `check_tile` with zero errors and zero warnings. Read it when a builder asks for something rich, a real module rather than a single counter. Steal the shell, swap the domain.

The example is a personal stock watchlist. The same shape powers a net-worth tile, a weather-conditions tile, a packaged-food tile, anything with a list, a headline number, an add form, settings, and a live API. The domain is just paint.

---

## What makes it Fuel-grade (the checklist this tile satisfies)

A trivial counter is one number and two buttons. A Fuel-grade tile earns its place on the dashboard the way the real Fuel module does. This one hits every mark:

- **Multi-section layout.** A header with a title and a settings gear, a hero headline number, a live holdings list, an add form, an actions row, a settings drawer, a footer. Distinct sections, one calm rhythm.
- **Responsive, small on the grid AND opened full.** A centered `max-width` column, `clamp()` type that scales with the viewport, flex rows that wrap, and a narrow breakpoint that simplifies the add form. It reads well in a small grid cell and full-screen.
- **A real capability (bring your own key).** It calls a live quote API straight from the user's browser with the user's own free key, the Aikido move from `api-plugins.md`. No Vitality key ever touches a tile.
- **Honest, warm states.** No key shows a gentle doorway, not a broken screen. Empty shows an invitation. A failed fetch shows one calm line, never a red stack trace. A remove asks before it deletes.
- **The bug-lessons baked in.** Local date keys, transform/opacity-only motion, host-bridge persistence with a standalone localStorage fallback wrapped in try/catch, saves held behind a loaded flag, inputs clamped, glyphs drawn as inline SVG, mint `::selection`, a `prefers-reduced-motion` escape hatch. These are the `gotchas.md` rules, already applied.
- **One report, done right.** It reports a single stream (portfolio value, `kind:'money'`) so it feeds the dashboard and the optional Vee tile, and only when it has real numbers.

---

## The full tile

This is the whole file. It is sealed: no libraries, no CDN, no external CSS, no runtime fonts. Paste it into `/app/create` or `upload_tile` it as-is, then read the tour below to learn the moves.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markets</title>
<style>
:root{
  --mint:#6EE7B7; --mint-glow:rgba(110,231,183,.4); --amber:#F59E0B;
  --ink:#e9efe9; --dim:rgba(233,239,233,.62); --faint:rgba(233,239,233,.34);
  --rule:rgba(233,239,233,.12); --card:rgba(255,255,255,.03);
  --serif:'Instrument Serif',Georgia,serif;
  --body:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{
  font-family:var(--body);color:var(--ink);background:transparent;accent-color:var(--mint);
  min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
  padding:clamp(14px,4vw,34px);line-height:1.45;user-select:none;-webkit-user-select:none;
}
::selection{background:rgba(110,231,183,.25);color:#fff}
::-moz-selection{background:rgba(110,231,183,.25);color:#fff}
input{caret-color:var(--mint);user-select:text;-webkit-user-select:text}

.wrap{width:100%;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(14px,3vw,20px)}

/* header */
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.brand{display:flex;flex-direction:column}
.title{font-family:var(--serif);font-style:italic;font-size:clamp(30px,8vw,46px);line-height:1}
.sub{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:6px}
.gear{
  flex:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--rule);
  background:var(--card);color:var(--dim);display:grid;place-items:center;cursor:pointer;
  transition:color .18s,border-color .18s,background-color .18s;
}
.gear:hover{color:var(--mint);border-color:var(--mint-glow)}
.gear:active{transform:scale(.94)}
.gear svg{width:18px;height:18px}

/* hero */
.hero{
  border:1px solid var(--rule);border-radius:20px;background:var(--card);
  padding:clamp(18px,5vw,26px);text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}
.cap{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.total{
  font-size:clamp(44px,13vw,78px);font-weight:600;line-height:1.05;font-variant-numeric:tabular-nums;
  background:linear-gradient(180deg,#fff,#9ff0cf);-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;margin-top:4px;
}
.change{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:14px;font-variant-numeric:tabular-nums;color:var(--dim)}
.change.up{color:var(--mint)}
.change.down{color:var(--amber)}
.change svg{width:13px;height:13px}

/* holdings list */
.list{display:flex;flex-direction:column;gap:8px}
.row{
  display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid var(--rule);
  border-radius:14px;background:var(--card);opacity:1;animation:rise .42s both;
  transition:background-color .2s,border-color .2s;
}
.row:hover{border-color:var(--mint-glow);background:rgba(110,231,183,.05)}
.sym{font-weight:700;font-size:15px;letter-spacing:.02em}
.shares{font-size:12px;color:var(--faint);margin-top:2px}
.spacer{flex:1;min-width:0}
.px{text-align:right;font-variant-numeric:tabular-nums}
.px .v{font-size:15px;font-weight:600}
.px .d{display:inline-flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:2px;font-size:11px;color:var(--dim)}
.px .d.up{color:var(--mint)}
.px .d.down{color:var(--amber)}
.px .d svg{width:10px;height:10px}
.x{
  flex:none;width:30px;height:30px;border-radius:9px;border:1px solid var(--rule);background:transparent;
  color:var(--faint);display:grid;place-items:center;cursor:pointer;
  transition:color .18s,border-color .18s,background-color .18s;
}
.x:hover{color:var(--amber);border-color:rgba(245,158,11,.5)}
.x:active{transform:scale(.9)}
.x svg{width:13px;height:13px}
.confirm{display:flex;gap:6px;flex:none}
.confirm button{
  font-family:inherit;font-size:11px;padding:6px 10px;border-radius:8px;cursor:pointer;
  border:1px solid var(--rule);background:transparent;color:var(--dim);
  transition:color .18s,border-color .18s,background-color .18s;
}
.confirm .yes{color:var(--amber);border-color:rgba(245,158,11,.5)}
.confirm button:active{transform:scale(.94)}
.empty{text-align:center;color:var(--faint);font-size:13px;padding:22px 12px;border:1px dashed var(--rule);border-radius:14px}

/* add form */
.add{display:flex;gap:8px;flex-wrap:wrap}
.add input{
  flex:1;min-width:0;background:var(--card);border:1px solid var(--rule);border-radius:12px;
  padding:12px 14px;color:var(--ink);font:15px var(--body);outline:none;transition:border-color .18s;
}
.add input:focus{border-color:var(--mint-glow)}
.add .sh{flex:0 0 98px}
.btn{
  font-family:inherit;cursor:pointer;border-radius:12px;font-size:14px;font-weight:700;padding:12px 18px;
  border:1px solid var(--mint);background:var(--mint);color:#042a1c;
  transition:transform .18s cubic-bezier(.16,1,.3,1),background-color .18s,border-color .18s;
}
.btn:hover{background:#9ff0cf}
.btn:active{transform:scale(.96)}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--rule)}
.btn.ghost:hover{color:var(--mint);border-color:var(--mint-glow)}

/* actions */
.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.msg{font-size:12px;color:var(--faint);min-height:16px}
.msg.warn{color:var(--amber)}

/* settings drawer */
.settings{
  border:1px solid rgba(110,231,183,.26);border-radius:16px;background:rgba(110,231,183,.05);
  padding:16px;display:flex;flex-direction:column;gap:10px;text-align:left;animation:rise .3s both;
}
.settings h3{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);font-weight:700}
.settings input{
  background:var(--card);border:1px solid var(--rule);border-radius:11px;padding:12px 14px;
  color:var(--ink);font:.95rem var(--body);outline:none;transition:border-color .18s;
}
.settings input:focus{border-color:var(--mint-glow)}
.settings p{font-size:.78rem;color:var(--dim);line-height:1.55}
.settings ol{margin:0;padding-left:18px;font-size:.8rem;color:var(--dim);line-height:1.7}

.foot{text-align:center;font-size:11px;color:var(--faint)}

@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:420px){.add .sh{flex:1 1 100%}.sub{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <div class="title">Markets</div>
      <div class="sub">your watchlist</div>
    </div>
    <button class="gear" id="gear" type="button" aria-label="settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>

  <div class="hero">
    <div class="cap">portfolio value</div>
    <div class="total" id="total">$0</div>
    <div class="change" id="change"></div>
  </div>

  <div class="settings" id="settings" hidden>
    <h3>live price key</h3>
    <input id="key" type="password" placeholder="paste your finnhub key" autocomplete="off">
    <button class="btn" id="saveKey" type="button" style="align-self:flex-start">save key</button>
    <p>Your key stays in this tile and talks straight to the price service from your own browser. It never passes through Vitality.</p>
    <ol>
      <li>Open finnhub.io and make a free account.</li>
      <li>Copy the API key from your dashboard.</li>
      <li>Paste it above. The free tier is plenty for a personal watchlist.</li>
    </ol>
  </div>

  <div class="list" id="list"></div>

  <div class="add">
    <input id="sym" type="text" placeholder="symbol, e.g. AAPL" autocomplete="off" maxlength="6" aria-label="ticker symbol">
    <input id="sh" class="sh" type="number" inputmode="decimal" min="0" step="any" placeholder="shares" aria-label="number of shares">
    <button class="btn" id="add" type="button">add</button>
  </div>

  <div class="actions">
    <div class="msg" id="msg"></div>
    <button class="btn ghost" id="refresh" type="button">refresh prices</button>
  </div>

  <div class="foot">live quotes use your own free key, saved only in this tile</div>
</div>

<script>
/* ---- the host bridge: save/load/report, with a standalone fallback ---- */
var Vitality = (function () {
  var waiters = {}, LS = 'vitality-markets-tile';
  function lsGet(){ try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function lsSet(d){ try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {} }
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (m && m.source === 'vitality-host' && m.type === 'load:result' && waiters[m.id]) {
      waiters[m.id](m.data); delete waiters[m.id];
    }
  });
  return {
    save: function (d) { lsSet(d); try { parent.postMessage({ source:'vitality-tile', type:'save', data:d }, '*'); } catch (e) {} },
    load: function () {
      return new Promise(function (res) {
        if (window.parent === window) { res(lsGet()); return; }   // opened standalone, no host frame
        var id = Math.random().toString(36).slice(2);
        waiters[id] = res;
        try { parent.postMessage({ source:'vitality-tile', type:'load', id:id }, '*'); } catch (e) {}
        setTimeout(function () { if (waiters[id]) { delete waiters[id]; res(lsGet()); } }, 1200); // never stuck empty
      });
    },
    report: function (s) { try { parent.postMessage({ source:'vitality-tile', type:'report', stream:s }, '*'); } catch (e) {} }
  };
})();

/* ---- local date key, never toISOString (UTC drift jumps the day) ---- */
function today(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ---- inline SVG glyphs, never emoji or unicode arrows ---- */
var UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
var DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M18 13l-6 6-6-6"/></svg>';
var XMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* ---- state. quotes are cached so a reopen shows last prices instantly ---- */
var state = { apiKey:'', holdings:[], quotes:{} };  // holdings: [{symbol, shares}]; quotes: {SYM:{c,dp}}
var loaded = false, busy = false, confirmSym = null, msgTimer = null;

function money(n){ var neg = n < 0; return (neg ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US'); }
function trimNum(n){ return (Math.round(n * 100) / 100).toString(); }
function hasKey(){ return !!state.apiKey; }

function totals(){
  var value = 0, change = 0, have = 0;
  state.holdings.forEach(function (h) {
    var q = state.quotes[h.symbol];
    if (q && typeof q.c === 'number') {
      value += q.c * h.shares;
      if (typeof q.dp === 'number') change += q.c * h.shares * (q.dp / 100);
      have++;
    }
  });
  return { value:value, change:change, have:have };
}

function flash(textMsg, warn){
  var m = document.getElementById('msg');
  m.textContent = textMsg || '';
  m.className = 'msg' + (warn ? ' warn' : '');
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
  if (textMsg && !warn) msgTimer = setTimeout(function () { m.textContent = ''; }, 2400);
}

/* ---- render: hero + list, honest about every state ---- */
function render(){
  var t = totals();
  document.getElementById('total').textContent = money(t.value);
  var ch = document.getElementById('change');
  if (t.have === 0) {
    ch.className = 'change';
    ch.textContent = hasKey() ? 'refresh to pull live prices' : 'add your key to see live prices';
  } else {
    var up = t.change >= 0;
    ch.className = 'change ' + (up ? 'up' : 'down');
    ch.innerHTML = (up ? UP : DOWN) + '<span>' + (up ? '+' : '') + money(t.change) + ' today</span>';
  }
  renderList();
}

function renderList(){
  var list = document.getElementById('list');
  if (!state.holdings.length) {
    list.innerHTML = '<div class="empty">add your first symbol below to start a watchlist</div>';
    return;
  }
  list.innerHTML = '';
  state.holdings.forEach(function (h, i) {
    var q = state.quotes[h.symbol];
    var row = document.createElement('div');
    row.className = 'row';
    row.style.animationDelay = (i * 0.05) + 's';
    var px = q ? money(q.c * h.shares) : '--';
    var dpHtml = '';
    if (q && typeof q.dp === 'number') {
      var up = q.dp >= 0;
      dpHtml = '<div class="d ' + (up ? 'up' : 'down') + '">' + (up ? UP : DOWN) + '<span>' + (up ? '+' : '') + q.dp.toFixed(2) + '%</span></div>';
    }
    var right = confirmSym === h.symbol
      ? '<div class="confirm"><button class="yes" type="button" data-yes="' + h.symbol + '">remove</button><button type="button" data-keep="1">keep</button></div>'
      : '<button class="x" type="button" data-x="' + h.symbol + '" aria-label="remove ' + h.symbol + '">' + XMARK + '</button>';
    row.innerHTML =
      '<div><div class="sym">' + h.symbol + '</div><div class="shares">' + trimNum(h.shares) + ' sh</div></div>' +
      '<div class="spacer"></div>' +
      '<div class="px"><div class="v">' + px + '</div>' + dpHtml + '</div>' +
      right;
    list.appendChild(row);
  });
}

/* ---- the capability: one quote per holding, from the user's own key ---- */
async function quote(symbol){
  var url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(state.apiKey);
  var res = await fetch(url);
  if (res.status === 401 || res.status === 403) throw new Error('that key was not accepted, check it in settings');
  if (res.status === 429) throw new Error('too many requests for a moment, try again shortly');
  if (!res.ok) throw new Error('could not reach the price service');
  return await res.json();   // { c: current, d: change, dp: percent change, ... }
}

async function refresh(){
  if (!hasKey()) { document.getElementById('settings').hidden = false; flash('add your free key to see live prices', true); return; }
  if (!state.holdings.length || busy) return;
  busy = true; flash('updating prices...');
  try {
    var quotes = await Promise.all(state.holdings.map(function (h) { return quote(h.symbol); }));
    state.holdings.forEach(function (h, i) {
      var q = quotes[i];
      if (q && typeof q.c === 'number' && q.c > 0) state.quotes[h.symbol] = { c:q.c, dp:q.dp };
    });
    persist(); render(); flash(''); reportTotal();
  } catch (e) {
    flash(e.message || 'could not update prices', true);   // calm line, never a raw stack
  }
  busy = false;
}

/* ---- the ONE report: portfolio value, only when it is real ---- */
function reportTotal(){
  var t = totals();
  if (t.have > 0 && t.value > 0) {
    Vitality.report({ key:'portfolio', label:'Portfolio', value:Math.round(t.value), date:today(), kind:'money', goalDirection:'up' });
  }
}

function addHolding(){
  var symEl = document.getElementById('sym'), shEl = document.getElementById('sh');
  var sym = (symEl.value || '').toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6);
  var sh = parseFloat(shEl.value);
  if (!sym) { flash('enter a symbol', true); symEl.focus(); return; }
  if (isNaN(sh) || sh <= 0) { flash('enter how many shares', true); shEl.focus(); return; }
  if (sh > 1000000) sh = 1000000;   // clamp an absurd typo, never log it raw
  var ex = state.holdings.find(function (h) { return h.symbol === sym; });
  if (ex) ex.shares = sh; else state.holdings.push({ symbol:sym, shares:sh });
  symEl.value = ''; shEl.value = '';
  persist(); render();
  if (hasKey()) refresh();
}

/* ---- wiring ---- */
document.getElementById('gear').onclick = function () {
  var s = document.getElementById('settings');
  s.hidden = !s.hidden;
  if (!s.hidden) document.getElementById('key').focus();   // focus, never select (no blue block)
};
document.getElementById('saveKey').onclick = function () {
  state.apiKey = document.getElementById('key').value.trim();
  persist();
  document.getElementById('settings').hidden = true;
  render();
  if (hasKey()) refresh();
};
document.getElementById('add').onclick = addHolding;
document.getElementById('refresh').onclick = refresh;
document.getElementById('sym').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('sh').focus(); });
document.getElementById('sh').addEventListener('keydown', function (e) { if (e.key === 'Enter') addHolding(); });

document.getElementById('list').addEventListener('click', function (e) {
  var x = e.target.closest('[data-x]');
  if (x) { confirmSym = x.getAttribute('data-x'); render(); return; }
  var keep = e.target.closest('[data-keep]');
  if (keep) { confirmSym = null; render(); return; }
  var yes = e.target.closest('[data-yes]');
  if (yes) {
    var s = yes.getAttribute('data-yes');
    state.holdings = state.holdings.filter(function (h) { return h.symbol !== s; });
    delete state.quotes[s];
    confirmSym = null; persist(); render(); reportTotal();
  }
});

/* ---- hydrate once, then allow saves (never persist empty defaults over real data) ---- */
Vitality.load().then(function (saved) {
  if (saved && typeof saved === 'object') {
    state.apiKey = saved.apiKey || '';
    state.holdings = Array.isArray(saved.holdings) ? saved.holdings : [];
    state.quotes = (saved.quotes && typeof saved.quotes === 'object') ? saved.quotes : {};
  }
  document.getElementById('key').value = state.apiKey;
  loaded = true;
  render();
  if (hasKey() && state.holdings.length) refresh();
});
function persist(){ if (loaded) Vitality.save({ apiKey:state.apiKey, holdings:state.holdings, quotes:state.quotes }); }
</script>
</body>
</html>
```

---

## The guided tour (what to copy, and why)

**The shell is the lesson.** A header bar, a hero number, a list, an add form, an actions row, a settings drawer, a footer, all stacked in one centered `max-width:520px` column with a single `gap`. Swap the domain and the shell carries over wholesale: a net-worth tile lists accounts, a habit tile lists streaks, a reading tile lists books. The headline number, the live list, and the add form are the three beats of almost every rich tile.

**Responsiveness comes from three cheap moves**, not a framework: a centered column with a `max-width`, `clamp()` on the type and the padding so nothing is fixed to one screen size, and `flex-wrap` plus one `@media (max-width:420px)` rule that lets the shares field drop to its own line and hides the eyebrow label when space is tight. That is the whole trick behind "small on the grid, opens full."

**The capability is bring-your-own-key, the Aikido move.** The gear opens a drawer with a password field. The key is saved inside the tile's own data via `Vitality.save`, next to the holdings, so it survives a reload and never lives in the HTML. `quote()` calls the live API straight from the user's browser with that key. A sealed tile cannot hold a Vitality key, but it can hold the user's, and that is enough to make it feel alive. Sell it on privacy: the request never passes through Vitality. The full pattern, and the Anthropic version for an AI tile, are in `api-plugins.md` and `ai-mentor.md`.

**Every state is honest and warm.** No key opens the drawer and says so kindly. An empty list invites the first symbol. A failed fetch shows one calm line through `flash(..., true)`, never a red stack trace, and red is reserved for genuine destruction anyway, so a price drop is amber caution, not alarm. Removing a holding asks first with an inline remove-or-keep, the soft-confirm from the gotchas, so a misfire never loses real work.

**The bug-lessons are already applied.** `today()` builds the date key from local getters, never `toISOString().slice`, which drifts a day. All motion is the `rise` keyframe (opacity and translate only) and transitions on color, background, border, and transform, never a layout property or `box-shadow` or `all`, so it holds 60fps on a phone. Persistence prefers the host bridge and falls back to localStorage only when the tile is opened standalone, every storage call wrapped in try/catch. Saves are held behind a `loaded` flag so the empty first paint never overwrites real saved data. The symbol is sanitized and the share count is clamped. Glyphs are inline SVG. There is a mint `::selection` and a `prefers-reduced-motion` escape hatch.

**It reports exactly one number.** `reportTotal()` emits the portfolio value as a single `money` stream, and only when there is at least one real quote, so the dashboard and the optional Vee tile get a true number and never a fabricated zero. One tile, one stream. A tile with no meaningful number simply never calls `report()`, and nothing breaks.

---

## Swapping the domain

Keep the shell, change four things:

1. **The title, eyebrow, and hero caption.** "Markets / your watchlist / portfolio value" becomes whatever the tile is.
2. **The row shape.** Here a row is symbol, shares, price, day change. For a net-worth tile it is account, type, balance. For a books tile it is title, author, progress.
3. **The API call.** `quote()` is one function. Point it at a different free-key endpoint (see the pairing table in `api-plugins.md`) and reshape the response. Keep the `fetch`, the status checks, and the warm throw.
4. **The report.** Pick the one number that matters and the `kind` that fits it (`money`, `count`, `measure`, `intake`, `duration`, `rating`, `done`), and report it only when it is real.

Everything else, the layout, the motion, the persistence, the states, the brand, the floor, is already correct. Build from here and the tile clears the Vitality bar by default. Run `check_tile` on your result and it should read PASS, zero errors, zero warnings, exactly as this one does.
