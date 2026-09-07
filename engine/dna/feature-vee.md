# Vee chat surface, cards, and entrances (sealed-HTML recipes)

Vee is Vitality's mentor: a warm character, not a chatbot widget. The Vee surface
runs on an iris (soft violet) accent over the same near-black, with mint kept for
"good / done" signals. The feel: cozy, springy, things settle in rather than snap.
Everything below is plain HTML/CSS/vanilla JS, ready to inline in one sealed tile.
No libraries, no frameworks. Honor the color law: mint/iris = good, amber = caution,
never red for a non-destructive state.

---

## Tokens (iris-led, on the Vitality black)

```css
:root{
  --bg:#000; --ink:#e9efe9;
  --ink-dim:rgba(233,239,233,0.62); --ink-faint:rgba(233,239,233,0.34);
  --rule:rgba(233,239,233,0.12); --rule-strong:rgba(233,239,233,0.22);
  --iris:#a78bfa; --iris-hi:#c4b5fd; --iris-glow:rgba(167,139,250,0.42); --iris-ink:#160d2e;
  --mint:#6ee7b7; --mint-hi:#a7f3d0; --mint-glow:rgba(110,231,183,0.4);
  --amber:#f59e0b; --amber-bd:rgba(245,158,11,0.36);
  --serif:'Instrument Serif',Georgia,serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --body:'Inter',-apple-system,system-ui,sans-serif;
  --ease:cubic-bezier(0.2,0.8,0.2,1); --ease-premium:cubic-bezier(0.16,1,0.3,1);
  --spring:cubic-bezier(0.34,1.56,0.64,1);
}
body{background:var(--bg);color:var(--ink);font-family:var(--body)}
/* soft iris sky behind it all, mint whisper on the right */
.sky{position:fixed;inset:0;z-index:0;pointer-events:none;background:
  radial-gradient(78% 32vh at 50% 0%,rgba(167,139,250,0.12),transparent 70%),
  radial-gradient(46% 30vh at 84% 8%,rgba(110,231,183,0.06),transparent 70%)}
```

Headlines are Instrument Serif italic. Small labels are mono uppercase with wide
letter-spacing (the eyebrow style). Body is Inter.

---

## The chat bubbles

Vee bubble sits left (iris wash, flat bottom-left corner). User bubble sits right
(faint white, flat bottom-right corner). A "thinking" bubble shows three bouncing
dots. This is the whole conversation surface.

```html
<div class="chatThread">
  <div class="bubVee">your recovery is up. today is a good day to push.</div>
  <div class="bubUser">how is my week looking?</div>
  <div class="bubThink"><span class="dots"><i></i><i></i><i></i></span>
    <span class="thinkLabel">Vee is thinking</span></div>
</div>
```

```css
.chatThread{display:flex;flex-direction:column;gap:12px}
.bubVee,.bubUser,.bubThink{padding:13px 16px;border-radius:16px;font-size:0.96rem;
  line-height:1.5;max-width:84%}
.bubVee{align-self:flex-start;background:rgba(167,139,250,0.1);
  border:1px solid rgba(167,139,250,0.26);border-bottom-left-radius:5px}
.bubUser{align-self:flex-end;background:rgba(255,255,255,0.04);
  border:1px solid var(--rule-strong);border-bottom-right-radius:5px;
  color:var(--ink-dim);white-space:pre-wrap}
.bubThink{align-self:flex-start;display:inline-flex;align-items:center;gap:10px;
  background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.2)}
.dots{display:inline-flex;gap:4px}
.dots i{width:6px;height:6px;border-radius:50%;background:var(--iris);
  animation:think 1.3s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:0.18s} .dots i:nth-child(3){animation-delay:0.36s}
@keyframes think{0%,80%,100%{opacity:0.25;transform:translateY(0)}
  40%{opacity:1;transform:translateY(-3px)}}
.thinkLabel{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.12em;
  text-transform:uppercase;color:var(--ink-faint)}
```

### The ask bar (input + send)

Textarea grows; iris send button with a paper-plane SVG. Enter sends, shift+Enter
newlines. Wire it in JS at the call site.

```html
<form class="ask">
  <div class="askRow">
    <textarea class="askInput" placeholder="talk to Vee…" rows="1"></textarea>
    <button class="askSend" aria-label="send">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#160d2e"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
    </button>
  </div>
  <p class="askHint">enter to send · shift+enter for a new line</p>
</form>
```

```css
.askRow{display:flex;gap:10px;margin-top:16px}
.askInput{flex:1;background:rgba(255,255,255,0.02);border:1px solid var(--rule);
  border-radius:14px;padding:13px 16px;color:var(--ink);font:0.95rem/1.4 var(--body);
  resize:none;transition:border-color .18s,box-shadow .18s}
.askInput::placeholder{color:var(--ink-faint)}
.askInput:focus{outline:none;border-color:rgba(167,139,250,0.6);
  box-shadow:0 0 0 3px rgba(167,139,250,0.12)}
.askSend{border:none;border-radius:14px;background:var(--iris);width:46px;flex:none;
  display:grid;place-items:center;cursor:pointer;transition:.18s}
.askSend:hover{background:var(--iris-hi)} .askSend:disabled{opacity:.45;cursor:default}
.askHint{margin-top:9px;font-family:var(--mono);font-size:0.56rem;letter-spacing:0.1em;
  text-transform:uppercase;color:var(--ink-faint)}
```

Suggestion chips for an empty chat (iris pills that lift on hover):

```css
.reply{font:0.86rem var(--body);color:var(--iris-hi);background:rgba(167,139,250,0.08);
  border:1px solid rgba(167,139,250,0.3);border-radius:999px;padding:8px 15px;
  cursor:pointer;transition:.18s}
.reply:hover{background:rgba(167,139,250,0.16);transform:translateY(-1px)}
```

---

## The Vee card (insight / noticed)

The card is Vee's main output: a small echo glyph + a mono tag, a serif-ish lead
line with one highlighted phrase, an optional data viz, then spark-action buttons.
Use the `.km`/`.ka`/`.ki` spans inside the lead so the eye lands on the one number.

```html
<article class="vc">
  <div class="vt-top">
    <span class="vt-echo"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
      stroke-linejoin="round"><path d="M5 7l7 11 7-11"/></svg></span>
    <span class="vt-tag">Today</span>
  </div>
  <div class="vt-body">
    <p class="vt-lead">you're at <span class="km">96 of 180g protein</span> with the day
      winding down. one more protein meal closes the gap.</p>
    <div class="bar"><i class="mint" style="--p:53%"></i></div>
    <div class="acts">
      <button class="act a-mint">log a meal</button>
      <button class="act a-ghost">done for today</button>
    </div>
  </div>
</article>
```

```css
.vc{position:relative;border:1px solid rgba(167,139,250,0.24);border-radius:18px;
  overflow:hidden;display:flex;flex-direction:column;
  background:radial-gradient(130% 95% at 0% 0%,rgba(167,139,250,0.08),transparent 55%),
    linear-gradient(180deg,rgba(167,139,250,0.04),rgba(255,255,255,0.004));
  box-shadow:0 0 55px -36px var(--iris-glow);transition:border-color .35s,box-shadow .35s}
.vc:hover{border-color:rgba(167,139,250,0.4)}
.vt-top{display:flex;align-items:center;gap:9px;padding:16px 20px 0}
.vt-echo{flex:none;width:23px;height:23px;border-radius:7px;display:grid;
  place-items:center;border:1px solid rgba(167,139,250,0.42);
  background:rgba(167,139,250,0.12);color:var(--iris-hi)}
.vt-tag{font-family:var(--mono);font-size:0.55rem;letter-spacing:0.18em;
  text-transform:uppercase;color:var(--iris-hi)}
.vt-tag.amb{color:var(--amber)}
.vt-body{padding:13px 20px 18px;display:flex;flex-direction:column;flex:1}
.vt-lead{font-family:var(--serif);font-style:italic;font-size:1.3rem;line-height:1.26}
.vt-lead .ki{color:var(--iris-hi)} .vt-lead .km{color:var(--mint-hi)} .vt-lead .ka{color:var(--amber)}
.bar{height:9px;border-radius:999px;background:rgba(255,255,255,0.06);
  border:1px solid var(--rule);position:relative;overflow:hidden;margin:16px 0 4px}
.bar i{position:absolute;inset:0;border-radius:999px;width:var(--p,60%)}
.bar i.mint{background:linear-gradient(90deg,#1f4d3d,var(--mint));
  box-shadow:0 0 12px -2px var(--mint-glow)}
/* spark-action buttons: outline that lights up + color-codes on hover */
.acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:auto;padding-top:18px}
.act{display:inline-flex;align-items:center;gap:8px;font:500 0.86rem var(--body);
  background:transparent;border:1px solid;border-radius:12px;padding:11px 16px;
  cursor:pointer;transition:color .26s,background .26s,border-color .26s,transform .22s,box-shadow .3s}
.act:active{transform:scale(.97)}
.a-mint{color:var(--mint-hi);border-color:rgba(110,231,183,0.4)}
.a-mint:hover{color:#04221a;background:var(--mint);border-color:var(--mint);
  transform:translateY(-2px);box-shadow:0 12px 28px -15px var(--mint-glow)}
.a-iris{color:var(--iris-hi);border-color:rgba(167,139,250,0.38)}
.a-iris:hover{color:var(--iris-ink);background:var(--iris);border-color:var(--iris);
  transform:translateY(-2px);box-shadow:0 12px 28px -15px var(--iris-glow)}
.a-amber{color:var(--amber);border-color:var(--amber-bd)}
.a-amber:hover{color:#2a1c02;background:var(--amber);border-color:var(--amber);transform:translateY(-2px)}
.a-ghost{color:var(--ink-dim);border-color:var(--rule)}
.a-ghost:hover{color:var(--ink);border-color:var(--rule-strong)}
```

For a heavier "Vee noticed" card with a lock-on arrival and the underline-glow
highlight, see `vee-noticed.md`. The `.key` highlight there is the canonical one.

---

## The underline-glow highlight

The one phrase that holds the value gets color plus a soft underline glow. One per
sentence. Mint for the good lever, amber for the gentle caution, never red.

```html
<p>a <span class="key">hard stop at 11</span> fixes the snacking behind it.</p>
```

```css
.key{color:var(--mint-hi);font-weight:700;border-bottom:2px solid rgba(110,231,183,0.55);
  padding-bottom:1px;text-shadow:0 0 22px var(--mint-glow)}
.key.amber{color:#fbbf3f;border-bottom-color:var(--amber-bd);
  text-shadow:0 0 22px rgba(245,158,11,0.4)}
```

---

## One-tap mood selector

Five line-art faces, low to high, one tap (no typing). The low end is a calm
slate, never red. The picked one lights up to its level tint. A tiny bar strip
below shows the trend. Drive it with one click handler that toggles `.on`.

```html
<div class="moodPick">
  <button class="moodOpt m1"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>
    <path d="M8 16c1-2 7-2 8 0"/><path d="M8.5 10h.01M15.5 10h.01"/></svg><span>low</span></button>
  <button class="moodOpt m2"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>
    <path d="M8.5 15c1-1 6-1 7 0"/><path d="M8.5 10h.01M15.5 10h.01"/></svg><span>meh</span></button>
  <button class="moodOpt m3 on"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>
    <path d="M8.5 14.5h7"/><path d="M8.5 10h.01M15.5 10h.01"/></svg><span>ok</span></button>
  <button class="moodOpt m4"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>
    <path d="M8.5 14c1 1.6 6 1.6 7 0"/><path d="M8.5 10h.01M15.5 10h.01"/></svg><span>good</span></button>
  <button class="moodOpt m5"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>
    <path d="M8 13.5c1.2 2.4 6.8 2.4 8 0"/><path d="M8.5 10h.01M15.5 10h.01"/></svg><span>great</span></button>
</div>
```

```css
.moodPick{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.moodOpt{display:flex;flex-direction:column;align-items:center;gap:7px;padding:13px 4px;
  border-radius:13px;border:1px solid var(--rule);background:rgba(255,255,255,0.012);
  cursor:pointer;transition:.18s var(--ease)}
.moodOpt:hover{border-color:var(--rule-strong);transform:translateY(-2px)}
.moodOpt svg{width:26px;height:26px;stroke:var(--ink-faint);fill:none;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round;transition:.18s}
.moodOpt span{font-family:var(--mono);font-size:0.52rem;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--ink-faint);transition:.18s}
.moodOpt.on{background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.4)}
.moodOpt.on svg{stroke:var(--lvl);filter:drop-shadow(0 0 7px var(--lvl))}
.moodOpt.on span{color:var(--ink)}
/* level tints, low to high. low end is calm slate, never red. */
.m1{--lvl:#8fa0c4} .m2{--lvl:#9a93d6} .m3{--lvl:#a78bfa} .m4{--lvl:#7fd9c0} .m5{--lvl:#6ee7b7}
```

```js
document.querySelectorAll('.moodOpt').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.moodOpt').forEach(function(x){x.classList.remove('on')});
    b.classList.add('on'); /* save b.querySelector('span').textContent here */
  });
});
```

---

## Vent doorway card

A warm hero that hands the conversation to Claude. Iris-washed, a teaser thread
(sample user line + Vee line), a primary button, a ghost fallback, trust glyphs.

```html
<div class="door">
  <div class="doorHead">Vent with Vee</div>
  <p class="doorBody">Open a private conversation that already sees your day. It
    listens first, then says the one true thing that helps.</p>
  <div class="doorThread">
    <div class="bubUser">i feel behind on everything.</div>
    <div class="bubVee">you slept under 6h three nights this week. that is the
      weight, not you. one early night turns it.</div>
    <div class="doorTag">A sample. This becomes yours once Vee has a few days of your data.</div>
  </div>
  <div class="doorActions">
    <a class="act a-iris" href="#">talk it through</a>
    <button class="act a-ghost">or vent right here</button>
  </div>
</div>
```

```css
.door{position:relative;overflow:hidden;border:1px solid rgba(167,139,250,0.26);
  border-radius:18px;padding:22px;
  background:linear-gradient(180deg,rgba(167,139,250,0.08),rgba(167,139,250,0.015))}
.door::after{content:'';position:absolute;right:-40px;top:-50px;width:200px;height:200px;
  pointer-events:none;background:radial-gradient(circle,rgba(167,139,250,0.16),transparent 65%)}
.doorHead{position:relative;font-family:var(--serif);font-style:italic;font-size:1.5rem}
.doorBody{position:relative;margin:9px 0 0;color:var(--ink-dim);font-size:0.95rem;
  line-height:1.55;max-width:460px}
.doorThread{position:relative;display:flex;flex-direction:column;gap:9px;margin:18px 0 4px}
.doorTag{font-family:var(--mono);font-size:0.54rem;letter-spacing:0.14em;
  text-transform:uppercase;color:var(--ink-faint);margin:2px 0 0 4px}
.doorActions{position:relative;display:flex;flex-direction:column;gap:11px;margin-top:18px}
.doorActions .act{justify-content:center;padding:15px 18px;text-decoration:none}
```

---

## Folded notes (cozy progressive disclosure)

Never a wall of rows. Collapsed cards open one at a time; a diamond marker blooms
to mint when that area has a saved fact. The chevron rotates. Pure CSS expand via
a `.open` class toggled on click (`max-height` 0 to a large value).

```html
<div class="veeNote">
  <button class="noteHead">
    <span class="noteTile"><svg class="noteGlyph" viewBox="0 0 24 24">
      <path d="M4 12h16"/><circle cx="12" cy="12" r="3"/></svg></span>
    <span class="noteText"><span class="noteLabel">Your life right now</span>
      <span class="noteHelp">the big stuff on your plate</span></span>
    <span class="noteDiamond"></span>
    <svg class="noteChev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
  </button>
  <div class="noteBody"><div class="noteInner">your saved facts go here</div></div>
</div>
```

```css
.veeNote{border:1px solid var(--rule);border-radius:14px;overflow:hidden;
  background:linear-gradient(180deg,rgba(255,255,255,0.018),rgba(255,255,255,0.004));
  transition:border-color .22s var(--ease)}
.veeNote.open{border-color:rgba(167,139,250,0.28)}
.noteHead{display:flex;align-items:center;gap:13px;width:100%;text-align:left;
  background:none;border:none;cursor:pointer;padding:13px 15px;color:inherit}
.noteTile{flex:none;width:30px;height:30px;border-radius:9px;display:grid;
  place-items:center;background:rgba(167,139,250,0.06);transition:background .22s}
.veeNote.open .noteTile{background:rgba(167,139,250,0.13)}
.noteGlyph{width:17px;height:17px;fill:none;stroke:var(--iris-hi);stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.noteText{flex:1;min-width:0}
.noteLabel{display:block;font-family:var(--serif);font-style:italic;font-size:1.12rem}
.noteHelp{display:block;margin-top:2px;font-size:0.78rem;color:var(--ink-faint)}
.noteDiamond{flex:none;width:8px;height:8px;border-radius:2px;
  border:1px solid rgba(167,139,250,0.5);transform:rotate(45deg)}
.veeNote.done .noteDiamond{background:var(--mint);border-color:var(--mint);
  box-shadow:0 0 8px -1px var(--mint)}
.noteChev{flex:none;width:15px;height:15px;fill:none;stroke:var(--ink-faint);
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;
  transition:transform .26s var(--spring),stroke .22s}
.veeNote.open .noteChev{transform:rotate(90deg);stroke:var(--iris-hi)}
.noteBody{max-height:0;opacity:0;overflow:hidden;
  transition:max-height .38s var(--ease),opacity .24s var(--ease)}
.veeNote.open .noteBody{max-height:720px;opacity:1}
.noteInner{padding:2px 15px 15px}
```

```js
document.querySelectorAll('.noteHead').forEach(function(h){
  h.addEventListener('click',function(){h.closest('.veeNote').classList.toggle('open')});
});
```

A saved-fact row inside uses the iris diamond marker (echoes the gem facet):

```css
.ctxRow{position:relative;padding:11px 14px 11px 32px;border-radius:12px;
  background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.14);
  font-size:0.92rem;color:var(--ink)}
.ctxRow::before{content:'';position:absolute;left:12px;top:15px;width:7px;height:7px;
  border-radius:2px;background:var(--iris-hi);transform:rotate(45deg);
  box-shadow:0 0 8px -1px var(--iris)}
```

---

## Springy card entrances

Vee things settle in, they do not snap. Three reusable spring entrances: rise
(bubbles, rows), settle (cards), and a diamond pop (markers). Stagger with
`animation-delay`. All wrapped in a reduced-motion guard.

```css
@keyframes mdRise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@keyframes noteSettle{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
@keyframes diamondPop{0%{transform:rotate(45deg) scale(0)}
  60%{transform:rotate(45deg) scale(1.12)}100%{transform:rotate(45deg) scale(1)}}
/* cozy pop for a loading line: bounce in, slight overshoot, settle */
@keyframes cozyPop{0%{opacity:0;transform:scale(.8) translateY(8px)}
  60%{opacity:1;transform:scale(1.04)}100%{transform:scale(1) translateY(0)}}

.bubVee,.bubUser{animation:mdRise .5s var(--ease) both}
.veeNote{animation:noteSettle .5s var(--spring) both}
.veeNote:nth-child(1){animation-delay:.09s}
.veeNote:nth-child(2){animation-delay:.18s}
.veeNote:nth-child(3){animation-delay:.27s}

@media (prefers-reduced-motion:reduce){
  *{animation:none !important;transition:none !important}
  .veeNote,.ctxRow,.bubVee,.bubUser{opacity:1 !important;transform:none !important}
}
```

For a one-tile multi-card grid that plays a random springy entrance per card on
load (the card-library effect), keep a small array of keyframe names and assign
each card `animation: <name> <dur>s <ease> <i*0.065>s both` in a load loop. See
`motion.md` for the full randomized-entrance helper.

---

## The cozy loader (the real "Pop / cozy" wait treatment)

When a tile is waiting (a fetch, a save, a think), do not show a spinner. Show a
playful tag that bounces in, a line that springs up under it with one phrase
color-tinted, and three pulsing dots. The whole card tints to a tone. This is the
look Alex loves; reuse it for every waiting moment.

```html
<article class="loader" data-tone="mint">
  <span class="tag">Fuel fact</span>
  <p class="text">protein keeps you full, so you eat
    <span class="hl">about 400 fewer calories</span> a day.</p>
  <div class="dots"><i></i><i></i><i></i></div>
</article>
```

```css
.loader{--tone:var(--mint);--tone-ink:#06281d;border:1px solid rgba(110,231,183,0.28);
  background:rgba(255,255,255,0.02);border-radius:14px;padding:14px;
  display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.loader[data-tone="iris"]{--tone:#a78bfa;--tone-ink:#1b1233;border-color:rgba(167,139,250,0.32)}
.loader[data-tone="amber"]{--tone:var(--amber);--tone-ink:#2a1903;border-color:var(--amber-bd)}
.tag{font-family:var(--mono);font-size:0.58rem;font-weight:600;letter-spacing:0.14em;
  text-transform:uppercase;color:var(--tone-ink);background:var(--tone);
  border-radius:999px;padding:3px 10px;animation:cozyTagPop .5s var(--spring)}
.text{margin:0;font-weight:500;font-size:0.88rem;line-height:1.35;color:#eafff7;
  animation:cozyPop .55s var(--spring)}
.hl{color:var(--tone);font-weight:700}
.dots{display:flex;gap:6px}
.dots i{width:6px;height:6px;border-radius:50%;background:var(--tone);opacity:.4;
  animation:cozyDot 1.2s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:.2s} .dots i:nth-child(3){animation-delay:.4s}
@keyframes cozyTagPop{0%{opacity:0;transform:scale(.6) rotate(-6deg)}100%{opacity:1;transform:none}}
@keyframes cozyDot{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
@media (prefers-reduced-motion:reduce){.tag,.text,.dots i{animation:none}}
```

Rotate the line/tag every ~3.2s in JS by swapping textContent and re-keying the
element (clone-and-replace) so the pop replays. Always pick a new index, never
repeat the current one.
