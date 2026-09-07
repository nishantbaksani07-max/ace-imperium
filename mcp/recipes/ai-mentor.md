# AI mentor / chatbot tile (bring your own Anthropic key)

This is the Aikido move on the AI-key problem. A tile cannot hold one of Vitality's keys, but it CAN hold the USER'S OWN key and talk to Claude directly. The user pastes their key once into the tile's settings, the key lives in the tile's saved data, the request goes from the user's own browser to Anthropic, and the user spends their own (tiny) quota. Cost and trust stay with the person who built the tile. This is how a tile becomes a real mentor instead of a toy.

The voice here is Vee, Vitality's mentor. Build the chat surface from `feature-vee.md` (bubbles, ask bar, thinking dots, the cozy loader) so it is unmistakably on-brand. Honor the color law: mint/iris mean good, amber is caution, never red for a non-destructive state.

This file gives you (1) when to flag that a tile needs a key, (2) the directions to get one, (3) the settings gear that takes the key, (4) the exact browser-direct Claude call, (5) the mentor's system prompt grounded in Vee, and (6) how it all wires together while staying sealed.

---

## 1. Flag it warmly (the "this needs a key" moment)

When a builder asks for an AI mentor, a coach, a chatbot, an "ask me anything", or written advice, the tile needs an Anthropic key. Say so plainly and kindly, never as a blocker:

> "This one talks to Claude, so it needs your own Anthropic key. It costs a tiny amount per message, fractions of a cent, and you paste the key once in the tile's settings. Here is how to get it."

Then build the tile so a missing key shows a warm "add your key to wake Vee up" prompt, never a broken or silent screen.

### Why your own key (sell it on privacy, not cost)

The reason to get a separate key is privacy, and that is a feature, not a chore. Keep the pitch short, warm, and professional:

> "Your mentor talks straight to Claude with your own key, so your conversations stay yours alone and never pass through Vitality. It costs only fractions of a cent a message, and setup takes about two minutes, once."

A one-line chip version:

> "Private by design. Your key, your chats, straight to Claude, never through our servers."

And say the future plan plainly, so it reads as a deliberate choice and not a gap:

> "A built-in Vitality option may arrive in a future update. For now, while Vitality is new, we will not route your private conversations through our own key. Your privacy is worth the one small step."

---

## 2. The directions to engrave (getting the key)

Put these exact steps in the tile (or its settings panel), in plain words:

1. Go to console.anthropic.com and sign in (or make a free account).
2. Open Settings, then API Keys, then Create Key. Copy the `sk-ant-...` string it shows once.
3. Add a little credit under Billing. A few dollars lasts a very long time for a personal tile.
4. Paste the key into this tile's settings (next section). It is saved only in your tile.

Cost framing, so the user is never surprised:

| Model | Best for | Price (per 1M tokens) | A short mentor reply |
|-------|----------|------------------------|----------------------|
| `claude-haiku-4-5` | the cheapest, fast everyday chat | $1 in / $5 out | a small fraction of a cent |
| `claude-opus-4-8` | the smartest, for deep advice (the default) | $5 in / $25 out | still about a cent |

Default to `claude-opus-4-8` for quality. Offer `claude-haiku-4-5` as the budget option for a high-volume chat tile; the cost is the builder's call, so make it easy to switch.

---

## 3. The settings gear (where the key is pasted)

A small gear button opens a settings panel with one row: a password input for the key and a Save button. The key is stored in the tile's saved data via `Vitality.save`, so it survives reloads. Never hardcode a key. Never use a Vitality-owned key.

```html
<button class="gear" id="gear" aria-label="settings">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
</button>

<div class="settings" id="settings" hidden>
  <label class="setLabel" for="key">Anthropic API key</label>
  <input class="setInput" id="key" type="password" placeholder="paste your sk-ant-... key here" autocomplete="off" />
  <p class="setHint">Saved only in this tile. Get one at console.anthropic.com, then add a little credit.</p>
  <button class="setSave" id="saveKey">Save key</button>
</div>
```

```css
.gear{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:10px;
  border:1px solid var(--rule,rgba(233,239,233,.12));background:rgba(255,255,255,.03);
  color:rgba(233,239,233,.55);display:grid;place-items:center;cursor:pointer;
  transition:color .18s,border-color .18s,background .18s}
.gear:hover{color:#c4b5fd;border-color:rgba(167,139,250,.5)}
.settings{margin:14px 0;padding:16px;border-radius:14px;border:1px solid rgba(167,139,250,.26);
  background:rgba(167,139,250,.06);display:flex;flex-direction:column;gap:9px;text-align:left}
.setLabel{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.58rem;
  letter-spacing:.14em;text-transform:uppercase;color:#c4b5fd}
.setInput{background:rgba(255,255,255,.04);border:1px solid rgba(233,239,233,.12);
  border-radius:11px;padding:12px 14px;color:#e9efe9;font:.95rem var(--body,'Inter',sans-serif);
  caret-color:#a78bfa;outline:none;transition:border-color .18s}
.setInput:focus{border-color:rgba(167,139,250,.6)}
.setHint{font-size:.78rem;color:rgba(233,239,233,.4);line-height:1.5}
.setSave{align-self:flex-start;border:none;border-radius:11px;background:#a78bfa;color:#160d2e;
  font-weight:700;font-size:.86rem;padding:10px 16px;cursor:pointer;transition:background .18s}
.setSave:hover{background:#c4b5fd}
::selection{background:rgba(110,231,183,.25);color:#fff}
```

```js
var state = { apiKey: '', model: 'claude-opus-4-8', history: [] };

Vitality.load().then(function (saved) {
  if (saved && typeof saved === 'object') state = Object.assign(state, saved);
  document.getElementById('key').value = state.apiKey || '';
  render();
});

function persist(){ Vitality.save(state); }                 // saves key AND history together

document.getElementById('gear').onclick = function () {
  var s = document.getElementById('settings');
  s.hidden = !s.hidden;
};
document.getElementById('saveKey').onclick = function () {
  state.apiKey = document.getElementById('key').value.trim();
  persist();
  document.getElementById('settings').hidden = true;
  render();
};

function hasKey(){ return !!state.apiKey; }
```

When `hasKey()` is false, render a warm doorway instead of the chat: one Vee line ("paste your key in settings and I will wake up") and a gentle arrow to the gear. Never a raw error.

---

## 4. Call Claude from the tile (browser-direct, the user's key)

A sealed tile has no SDK, so it calls the Messages API with `fetch()`. The `anthropic-dangerous-direct-browser-access` header is what lets the request run from a browser at all. It does expose the key in the user's own browser, which is fine here because it is the user's own key in the user's own tile.

Do NOT send `temperature`, `top_p`, or `top_k`; current Claude models reject them. The system prompt carries the persona; `messages` is the running conversation and must alternate user and assistant, starting with user.

```js
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
      model: model || 'claude-opus-4-8',   // 'claude-haiku-4-5' is the cheapest option
      max_tokens: 1024,                     // a snappy, low-cost mentor reply; raise for longer advice
      system: MENTOR_SYSTEM,
      messages: history                     // [{role:'user',content:'...'},{role:'assistant',content:'...'}]
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
```

Keep the key out of any `Vitality.report` payload; report carries a number, never a secret. A mentor tile usually has no single meaningful stream, so it simply never calls `report()`, and nothing breaks.

---

## 5. The mentor's voice (grounded in Vee)

Distill Vee into the system prompt so the tile sounds like Vitality, not a generic assistant. Vee listens first, then says the one true thing that helps; concrete and kind; celebrates real wins; never shames a slip.

```js
var MENTOR_SYSTEM = [
  "You are Vee, a warm, grounded mentor living inside the user's Vitality dashboard.",
  "You are a caring character, not a chatbot. Listen first, then say the one true thing that helps.",
  "Be concrete and kind. Keep replies short and human, plain words, no clinical tone, no bullet lists unless asked.",
  "Celebrate real wins out loud. Never shame a slip; offer one small next step instead.",
  "You can see only what the user tells you in this chat. Never invent numbers or data about them."
].join(' ');
```

If you want Vee day-aware, have the tile put a short summary of the user's day in the first user message ("Here is my day so far: ..."). Keep it honest about what it can and cannot see.

---

## 6. Wire it together

Build the chat surface from `feature-vee.md`: the `.bubVee` / `.bubUser` bubbles, the `.ask` bar (Enter sends, Shift+Enter newlines), the three-dot thinking bubble, and the cozy loader for the wait. Then the loop:

```js
async function send(text){
  if (!hasKey()) { document.getElementById('settings').hidden = false; return; }
  state.history.push({ role: 'user', content: text });
  renderBubbles();                 // draw the user bubble
  showThinking(true);              // the bouncing-dots "Vee is thinking" bubble
  try {
    var reply = await askClaude(state.history, state.apiKey, state.model);
    state.history.push({ role: 'assistant', content: reply });
  } catch (e) {
    showSoftError(e.message);      // a calm line, never a red stack trace
  }
  showThinking(false);
  persist();                       // saves the conversation AND the key
  renderBubbles();                 // draw Vee's reply
}
```

`render()` chooses between the key doorway (no key) and the chat (has key). `renderBubbles()` redraws `state.history` into the thread. Persist after every turn so the conversation and key survive a reload.

---

## 7. The seal, honestly

The tile stays sealed: it loads no external code or stylesheet, it only sends messages to Anthropic with the user's own key. The rules are simple. Never hardcode a key. Never carry a Vitality-owned key (those live server-side in Vitality and never reach a tile). Keep the user's key in `Vitality.save` data, not in the HTML and not in a `report()` call. Fail warm when the key is missing or rejected. Do that, and a one-file tile becomes a real, private mentor that costs the user fractions of a cent and feels like magic.

For the whole thing assembled into one complete, sealed, floor-clean tile, see `example-mentor-tile.md`: a full chat mentor with bubbles, an ask bar, thinking dots, the settings gear, the warm no-key gate, and the safe `textContent` rendering, ready to build any coach or chatbot from.

The same shape powers any keyed capability, not just chat: swap the endpoint and the system prompt for a different model or service, keep the settings-gear key pattern and the warm no-key gate. See `api-plugins.md` for the non-AI version (USDA food data and other free-key APIs).
