# Worked example: an AI mentor tile (bring your own Anthropic key)

The companion to `example-markets-tile.md`. That one is the ceiling for a data tile; this is the ceiling for an AI tile. ONE complete, sealed, on-brand chat mentor that brings the user's own Anthropic key, talks straight to Claude from the browser, sounds like Vee, and passes the floor at zero errors and zero warnings. Read it when a builder asks for a coach, a chatbot, an "ask me anything", or written advice. The capability pattern (the gear, the key, the call) is in `ai-mentor.md`; this is the whole tile, assembled.

The one move that makes a chat tile both safe and floor-clean: render every message with `textContent` (a DOM API), never by interpolating text into an HTML string. The model's reply and the user's text never become markup, so a stray `</script>` or `<img onerror>` in a reply cannot break or hijack the tile, and the static HTML the linter sees stays balanced.

---

## What makes it ceiling-grade

- **A real chat surface.** Iris-tinted Vee bubbles, mint-tinted user bubbles, a three-dot thinking indicator, an auto-growing ask bar (Enter sends, Shift+Enter newlines), the whole conversation persisted so it survives a reload.
- **The capability, done right.** A settings gear stores the user's own `sk-ant-...` key and model choice in the tile's saved data; the request goes browser-direct to Anthropic with that key; no Vitality key ever touches a tile. Sold on privacy, not cost.
- **Honest, warm states.** No key shows a calm doorway, not a dead input. A rejected key or a network hiccup shows one soft line, never a red stack trace. The mentor never shames.
- **The bug-lessons baked in.** Model output rendered via `textContent` (XSS-safe, floor-clean), host-bridge persistence with a standalone localStorage fallback in try/catch, saves held behind a loaded flag, transform/opacity-only motion with a reduced-motion escape hatch, mint `::selection`, inline-SVG glyphs. It reports nothing: a mentor has no single meaningful number, so it simply never calls `report()`, and nothing breaks.

---

## The full tile

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mentor</title>
<style>
:root{
  --mint:#6EE7B7; --mint-glow:rgba(110,231,183,.4); --iris:#a78bfa; --iris-glow:rgba(167,139,250,.4);
  --amber:#F59E0B; --ink:#e9efe9; --dim:rgba(233,239,233,.62); --faint:rgba(233,239,233,.34);
  --rule:rgba(233,239,233,.12); --card:rgba(255,255,255,.03);
  --serif:'Instrument Serif',Georgia,serif;
  --body:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{
  font-family:var(--body);color:var(--ink);background:transparent;accent-color:var(--iris);
  min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
  padding:clamp(12px,3.5vw,28px);line-height:1.5;user-select:none;-webkit-user-select:none;
}
::selection{background:rgba(110,231,183,.25);color:#fff}
::-moz-selection{background:rgba(110,231,183,.25);color:#fff}
textarea,input,select{caret-color:var(--mint);user-select:text;-webkit-user-select:text}

.wrap{width:100%;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:14px;flex:1}

/* header */
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.title{font-family:var(--serif);font-style:italic;font-size:clamp(28px,7vw,42px);line-height:1}
.sub{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:6px}
.gear{
  flex:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--rule);background:var(--card);
  color:var(--dim);display:grid;place-items:center;cursor:pointer;
  transition:color .18s,border-color .18s,background-color .18s;
}
.gear:hover{color:var(--iris);border-color:var(--iris-glow)}
.gear:active{transform:scale(.94)}
.gear svg{width:18px;height:18px}

/* settings drawer */
.settings{
  border:1px solid var(--iris-glow);border-radius:16px;background:rgba(167,139,250,.06);padding:16px;
  display:flex;flex-direction:column;gap:10px;text-align:left;animation:rise .3s both;
}
.settings h3{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--iris);font-weight:700}
.settings input,.settings select{
  background:var(--card);border:1px solid var(--rule);border-radius:11px;padding:11px 13px;
  color:var(--ink);font:.92rem var(--body);outline:none;transition:border-color .18s;
}
.settings input:focus,.settings select:focus{border-color:var(--iris-glow)}
.settings p{font-size:.78rem;color:var(--dim);line-height:1.55}
.settings ol{margin:0;padding-left:18px;font-size:.78rem;color:var(--dim);line-height:1.7}
.savek{
  align-self:flex-start;font-family:inherit;cursor:pointer;border-radius:11px;font-size:.84rem;font-weight:700;
  padding:9px 15px;border:1px solid var(--iris);background:var(--iris);color:#160d2e;
  transition:transform .16s cubic-bezier(.16,1,.3,1),background-color .18s;
}
.savek:hover{background:#c4b5fd}
.savek:active{transform:scale(.96)}

/* thread */
.thread{display:flex;flex-direction:column;gap:10px;padding:4px 2px;flex:1;min-height:120px;overflow-y:auto}
.bub{
  max-width:84%;padding:11px 14px;border-radius:16px;font-size:14.5px;line-height:1.5;
  white-space:pre-wrap;overflow-wrap:anywhere;animation:rise .35s both;
}
.bub.vee{align-self:flex-start;background:rgba(167,139,250,.10);border:1px solid var(--iris-glow);border-bottom-left-radius:5px}
.bub.user{align-self:flex-end;background:rgba(110,231,183,.10);border:1px solid var(--mint-glow);border-bottom-right-radius:5px}
.think{
  align-self:flex-start;display:inline-flex;gap:4px;padding:14px 15px;border-radius:16px;border-bottom-left-radius:5px;
  background:rgba(167,139,250,.10);border:1px solid var(--iris-glow);
}
.dot{width:6px;height:6px;border-radius:50%;background:var(--iris);animation:blink 1.2s infinite both}
.dot:nth-child(2){animation-delay:.18s}
.dot:nth-child(3){animation-delay:.36s}

/* no-key doorway */
.gate{
  align-self:stretch;text-align:center;padding:22px 16px;border:1px dashed var(--iris-glow);border-radius:16px;
  background:rgba(167,139,250,.05);color:var(--dim);font-size:13.5px;line-height:1.6;
}
.gate b{color:var(--ink);font-weight:600}
.gatebtn{
  margin-top:12px;font-family:inherit;cursor:pointer;border-radius:11px;font-size:13px;font-weight:700;
  padding:10px 16px;border:1px solid var(--iris);background:var(--iris);color:#160d2e;
  transition:transform .16s cubic-bezier(.16,1,.3,1),background-color .18s;
}
.gatebtn:hover{background:#c4b5fd}
.gatebtn:active{transform:scale(.96)}

.msg{font-size:12px;color:var(--faint);min-height:15px;text-align:center}
.msg.warn{color:var(--amber)}

/* ask bar */
.ask{display:flex;gap:8px;align-items:flex-end;position:sticky;bottom:0;padding-top:4px}
.ask textarea{
  flex:1;min-width:0;resize:none;background:var(--card);border:1px solid var(--rule);border-radius:14px;
  padding:12px 14px;color:var(--ink);font:14.5px var(--body);outline:none;max-height:140px;
  transition:border-color .18s;
}
.ask textarea:focus{border-color:var(--mint-glow)}
.send{
  flex:none;width:44px;height:44px;border-radius:13px;border:1px solid var(--mint);background:var(--mint);
  color:#042a1c;display:grid;place-items:center;cursor:pointer;
  transition:transform .16s cubic-bezier(.16,1,.3,1),background-color .18s;
}
.send:hover{background:#9ff0cf}
.send:active{transform:scale(.92)}
.send:disabled{opacity:.5;cursor:default}
.send svg{width:18px;height:18px}

@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@media (max-width:420px){.sub{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <div class="title">Vee</div>
      <div class="sub">your mentor</div>
    </div>
    <button class="gear" id="gear" type="button" aria-label="settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>

  <div class="settings" id="settings" hidden>
    <h3>connect your mentor</h3>
    <input id="key" type="password" placeholder="paste your sk-ant-... key" autocomplete="off">
    <select id="model" aria-label="model">
      <option value="claude-opus-4-8">Opus 4.8, the smartest (default)</option>
      <option value="claude-haiku-4-5">Haiku 4.5, the cheapest and fast</option>
    </select>
    <button class="savek" id="saveKey" type="button">save key</button>
    <p>Your mentor talks straight to Claude with your own key, so your conversations stay yours alone and never pass through Vitality. It costs only fractions of a cent a message.</p>
    <ol>
      <li>Go to console.anthropic.com and sign in.</li>
      <li>Open Settings, then API Keys, then Create Key. Copy the sk-ant key.</li>
      <li>Add a little credit under Billing. A few dollars lasts a long time.</li>
    </ol>
  </div>

  <div class="thread" id="thread"></div>
  <div class="msg" id="msg"></div>

  <div class="ask">
    <textarea id="input" rows="1" placeholder="tell me what is on your mind" aria-label="message"></textarea>
    <button class="send" id="send" type="button" aria-label="send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>
    </button>
  </div>
</div>

<script>
/* ---- host bridge: save/load, with a standalone fallback (report unused here) ---- */
var Vitality = (function () {
  var waiters = {}, LS = 'vitality-mentor-tile';
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
        if (window.parent === window) { res(lsGet()); return; }
        var id = Math.random().toString(36).slice(2);
        waiters[id] = res;
        try { parent.postMessage({ source:'vitality-tile', type:'load', id:id }, '*'); } catch (e) {}
        setTimeout(function () { if (waiters[id]) { delete waiters[id]; res(lsGet()); } }, 1200);
      });
    }
  };
})();

/* ---- the mentor's voice, distilled from Vee ---- */
var MENTOR_SYSTEM = [
  "You are Vee, a warm, grounded mentor living inside the user's Vitality dashboard.",
  "You are a caring character, not a chatbot. Listen first, then say the one true thing that helps.",
  "Be concrete and kind. Keep replies short and human, plain words, no clinical tone, no bullet lists unless asked.",
  "Celebrate real wins out loud. Never shame a slip; offer one small next step instead.",
  "You can see only what the user tells you in this chat. Never invent numbers or data about them."
].join(' ');

var state = { apiKey:'', model:'claude-opus-4-8', history:[] }; // history: [{role,content}]
var loaded = false, busy = false, msgTimer = null;

function hasKey(){ return !!state.apiKey; }
function el(id){ return document.getElementById(id); }

function flash(text, warn){
  var m = el('msg');
  m.textContent = text || '';
  m.className = 'msg' + (warn ? ' warn' : '');
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
  if (text && !warn) msgTimer = setTimeout(function () { m.textContent = ''; }, 2600);
}

/* ---- render the thread. Every message goes in via textContent: model output and
        user text NEVER become markup, so a reply can never break or hijack the tile. ---- */
function bubble(role, contentText){
  var b = document.createElement('div');
  b.className = 'bub ' + (role === 'user' ? 'user' : 'vee');
  b.textContent = contentText;          // the safe sink
  return b;
}

function render(){
  var thread = el('thread');
  thread.innerHTML = '';
  if (!hasKey()) {
    var gate = document.createElement('div');
    gate.className = 'gate';
    gate.innerHTML = '<b>Add your key to wake me up.</b><br>Your chats stay yours, straight to Claude, never through Vitality.';
    var btn = document.createElement('button');
    btn.className = 'gatebtn'; btn.type = 'button'; btn.textContent = 'connect your key';
    btn.onclick = openSettings;
    gate.appendChild(document.createElement('br'));
    gate.appendChild(btn);
    thread.appendChild(gate);
    return;
  }
  if (!state.history.length) {
    thread.appendChild(bubble('vee', 'I am here. What is on your mind today?'));
  } else {
    state.history.forEach(function (m) { thread.appendChild(bubble(m.role, m.content)); });
  }
  if (busy) {
    var t = document.createElement('div');
    t.className = 'think';
    t.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    thread.appendChild(t);
  }
  thread.scrollTop = thread.scrollHeight;
}

/* ---- the capability: browser-direct Messages API, the user's own key ---- */
async function askClaude(history, apiKey, model){
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model || 'claude-opus-4-8',
      max_tokens: 1024,                 // a snappy, low-cost reply; raise for longer advice
      system: MENTOR_SYSTEM,
      messages: history                 // alternating user/assistant, starting with user
    })
  });
  if (res.status === 401 || res.status === 403) throw new Error('That key was not accepted. Check it in settings.');
  if (res.status === 429) throw new Error('Too many messages for a moment. Try again shortly.');
  if (!res.ok) throw new Error('Could not reach Claude. Try once more.');
  var data = await res.json();
  if (data.stop_reason === 'refusal') return 'I cannot help with that one. Ask me something else?';
  var block = (data.content || []).find(function (b) { return b.type === 'text'; });
  return block ? block.text : '';
}

async function send(){
  var input = el('input');
  var textVal = (input.value || '').trim();
  if (!hasKey()) { openSettings(); return; }
  if (!textVal || busy) return;
  state.history.push({ role:'user', content:textVal });
  input.value = ''; input.style.height = 'auto';
  busy = true; render(); persist();
  try {
    var reply = await askClaude(state.history, state.apiKey, state.model);
    state.history.push({ role:'assistant', content:reply });
  } catch (e) {
    flash(e.message || 'Something went wrong. Try once more.', true);
    state.history.pop();              // drop the unanswered turn so the thread stays valid
  }
  busy = false; render(); persist();
}

/* ---- settings ---- */
function openSettings(){
  var s = el('settings'); s.hidden = false; el('key').focus();   // focus, never select
}
el('gear').onclick = function () {
  var s = el('settings'); s.hidden = !s.hidden;
  if (!s.hidden) el('key').focus();
};
el('saveKey').onclick = function () {
  state.apiKey = el('key').value.trim();
  state.model = el('model').value;
  persist(); el('settings').hidden = true; render();
  if (hasKey()) el('input').focus();
};
el('send').onclick = send;
el('input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(140, this.scrollHeight) + 'px';
});
el('input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

/* ---- hydrate once, then allow saves ---- */
Vitality.load().then(function (saved) {
  if (saved && typeof saved === 'object') {
    state.apiKey = saved.apiKey || '';
    state.model = saved.model || 'claude-opus-4-8';
    state.history = Array.isArray(saved.history) ? saved.history : [];
  }
  el('key').value = state.apiKey;
  el('model').value = state.model;
  loaded = true;
  render();
});
function persist(){ if (loaded) Vitality.save({ apiKey:state.apiKey, model:state.model, history:state.history }); }
</script>
</body>
</html>
```

---

## The guided tour (the AI-specific moves)

**Render with `textContent`, always.** `bubble()` sets `b.textContent = contentText`, so the model's reply and the user's message are inserted as text, not parsed as HTML. This is the single most important rule for any tile that displays text it did not write: it makes the tile XSS-proof against a poisoned reply AND keeps the static document the linter checks perfectly balanced. Never build a bubble by concatenating a message into an HTML string.

**The key is the user's, the call is browser-direct.** The gear stores `sk-ant-...` and the model choice in the tile's own saved data via `Vitality.save`. `askClaude` calls the Messages API with `fetch`, carrying `x-api-key` and the `anthropic-dangerous-direct-browser-access` header that lets the request run from a browser at all. Do NOT send `temperature`, `top_p`, or `top_k`; current Claude models reject them. The seal holds: the tile loads no external code, it only sends messages to Anthropic with the user's own key, so the conversation and the cost both stay with the user. Sell that as privacy.

**Fail warm, never red.** A rejected key, a rate limit, or a network blip throws a calm sentence through `flash(..., true)`; the unanswered user turn is popped so the thread never ends on a dangling message. The no-key state is a gentle doorway with one button to the gear, not a broken input. Amber is the strongest colour used here; red is reserved for genuine destruction, which a mentor never does.

**It reports nothing, and that is correct.** A mentor has no single meaningful number to feed the dashboard, so the tile simply never calls `Vitality.report()`. That is the honest choice for a chat tile; do not invent a stream just to have one.

Swap the system prompt and the title and this same shell is any coach: a nutrition coach, a writing partner, a study tutor. Keep the `textContent` rendering, the BYO-key gear, the warm no-key gate, and the browser-direct call, and the tile clears the Vitality bar by default. Run `check_tile` on your result; it should read PASS, zero errors, zero warnings, exactly as this one does.
