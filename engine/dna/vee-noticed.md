# Vee and the "Vitality noticed" insight card

The voice and the one card that carries it. Vee is the companion who holds your whole
life at once and surfaces the single thing that matters. This is the heart of the OPTIONAL
Vee / mind tile; most tiles will not need it.

All of this inlines into a sealed HTML tile: plain CSS, vanilla JS, inline SVG. No frameworks.

---

## 1. The tokens (paste into `:root`)

Vee runs an iris-accented variant of the Vitality palette. Iris is Vee's signature.
Mint stays the "good / on track" color, amber the "gentle caution". Never red.

```css
:root{
  --bg:#000; --fg:#f3f1fb; /* --fg here is Vee surface only */
  /* iris = Vee's voice */
  --iris:#a78bfa; --iris-hi:#c4b5fd; --iris-glow:rgba(167,139,250,0.42); --iris-ink:#1c1240;
  /* mint = good, on track, the win */
  --mint:#6EE7B7; --mint-hi:#a7f3d0; --mint-deep:#1f4d3d; --mint-ink:#042a1c; --mint-glow:rgba(110,231,183,0.4);
  /* amber = gentle caution, never alarm, never red */
  --amber:#F59E0B; --amber-hi:#fbbf3f; --amber-bd:rgba(245,158,11,0.36); --amber-ink:#2a1c02; --amber-glow:rgba(245,158,11,0.4);
  --muted:rgba(233,239,233,0.55); --muted-strong:rgba(233,239,233,0.72);
  --border:rgba(255,255,255,0.08); --border-strong:rgba(255,255,255,0.16);
  --card:rgba(255,255,255,0.02);
  --serif:'Instrument Serif', Georgia, serif;
  --mono:'JetBrains Mono', ui-monospace, monospace;
  --body:'Inter', -apple-system, system-ui, sans-serif;
  --ease:cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-premium:cubic-bezier(0.16, 1, 0.3, 1);
  --spring:cubic-bezier(0.34,1.56,0.64,1);
}
```

Fonts loaded from Google Fonts (allowed; it is a stylesheet link, not a JS library):
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Typography roles:
- **Instrument Serif, italic** = the human, warm voice. Titles, the big closing line, principle headings.
- **Inter** = the card lead sentence and body. The lead is `font-weight:450`, a touch lighter than normal.
- **JetBrains Mono, uppercase, wide letter-spacing** = the machine layer. Eyebrows, tags, "watched" stamps, receipt chips. The contrast of warm-serif against cold-mono is the whole feel.

---

## 2. The card anatomy (top to bottom)

The "Vitality noticed" card has a fixed skeleton. Pour real data into the slots, never a paragraph.

1. **Header row** `.vt-top`: a small iris glyph badge `.vt-echo` (the Vee mark, a checkmark/V),
   then the mono tag `.vt-tag` reading "Vitality noticed", then on the right a pill
   `.vt-watched` showing what it looked at and over how long ("watched . money + training + mood . 6wk").
2. **The lead** `.vt-lead`: ONE plain-English sentence. This is the insight. Inside it, key facts
   are colored and the single takeaway phrase is underlined (the "sauce"/`.key` treatment).
3. **Impact row** `.impact`: "moves your goals" label, then pill chips `.gimp` naming which goals
   this just moved, with a tiny up/down triangle. This is what ties every card to a goal.
4. **Receipt chips** `.chips`: 2-4 mono chips showing the raw numbers behind the claim. The proof.
5. **Action row** `.acts`: one colored one-tap action button, plus the iris "talk deeper in Claude"
   button. Never more than two or three.

### Card shell CSS

```css
.vc{position:relative;border:1px solid rgba(167,139,250,0.34);border-radius:20px;overflow:hidden;
  background:radial-gradient(135% 100% at 0% 0%, rgba(167,139,250,0.10), transparent 55%),
             linear-gradient(180deg, rgba(167,139,250,0.05), rgba(255,255,255,0.004));
  box-shadow:0 0 70px -30px var(--iris-glow), 0 30px 80px -50px rgba(0,0,0,0.8);
  display:flex;flex-direction:column;
  transition:border-color .35s var(--ease), box-shadow .35s var(--ease)}
.vc::before{content:'';position:absolute;inset:0;border-radius:20px;pointer-events:none;
  box-shadow:inset 0 0 1px rgba(196,181,253,0.5);opacity:.6}        /* faint inner iris edge */
.vc:hover{border-color:rgba(167,139,250,0.5);
  box-shadow:0 0 80px -24px var(--iris-glow), 0 30px 80px -50px rgba(0,0,0,0.8)}

.vt-top{display:flex;align-items:center;gap:10px;padding:19px 23px 0}
.vt-echo{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;
  border:1px solid rgba(167,139,250,0.48);background:rgba(167,139,250,0.14);color:var(--iris-hi)}
.vt-tag{font-family:var(--mono);font-size:0.58rem;font-weight:500;letter-spacing:0.21em;
  text-transform:uppercase;color:var(--iris-hi)}
.vt-spacer{flex:1}
.vt-watched{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:0.52rem;
  letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);
  border:1px solid var(--border);border-radius:999px;padding:5px 10px}
.vt-watched svg{width:11px;height:11px}

.vt-body{padding:16px 23px 22px;display:flex;flex-direction:column}
.vt-lead{font-family:var(--body);font-weight:450;font-size:1.22rem;line-height:1.55;
  color:var(--fg);letter-spacing:-0.004em}
@media(max-width:560px){.vt-lead{font-size:1.1rem}}

.impact{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:18px;
  padding-top:16px;border-top:1px solid var(--border)}
.impact .il{font-family:var(--mono);font-size:0.52rem;letter-spacing:0.12em;
  text-transform:uppercase;color:var(--muted)}
.gimp{display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:600;
  border:1px solid;border-radius:999px;padding:5px 11px}
.gimp svg{width:11px;height:11px}
.gimp.up{color:var(--mint-hi);border-color:rgba(110,231,183,0.4);background:rgba(110,231,183,0.06)}
.gimp.dn{color:var(--amber-hi);border-color:var(--amber-bd);background:rgba(245,158,11,0.06)}

.chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:16px}
.chip{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:0.57rem;
  letter-spacing:0.05em;text-transform:uppercase;color:var(--muted-strong);
  border:1px solid var(--border);background:rgba(255,255,255,0.02);border-radius:10px;padding:7px 10px}
.chip.m{color:var(--mint-hi);border-color:rgba(110,231,183,0.28)}   /* good number */
.chip.a{color:var(--amber-hi);border-color:var(--amber-bd)}          /* caution number */
.chip svg{width:11px;height:11px;flex:none}
```

---

## 3. The highlight + underline treatment (the "sauce")

This is the signature move. Inside the lead sentence, mark up the words:

- **Key facts** get colored (no underline): mint for good, amber for caution, iris for Vee's voice.
- **The one takeaway phrase** (the single move) gets the **underlined glow** treatment. Exactly one
  per card. It is the thing you would say out loud if you had three words.

```css
/* colored key facts inside the lead */
.vt-lead .km{color:var(--mint-hi);font-weight:600}   /* good fact: "shipped 18/21 days" */
.vt-lead .ka{color:var(--amber-hi);font-weight:600}  /* caution fact: "1am work nights" */
.vt-lead .ki{color:var(--iris-hi);font-weight:600}   /* Vee / your-words: "get lean" */

/* THE underline-highlight: the one move. mint, underlined, glowing. one per card. */
.vt-lead .key{
  color:var(--mint-hi);
  font-weight:700;
  border-bottom:2px solid rgba(110,231,183,0.55);
  padding-bottom:1px;
  text-shadow:0 0 22px var(--mint-glow);
}
```

Markup it in plain HTML:
```html
<p class="vt-lead">your <span class="ka">spending climbs</span> the weeks your
<span class="ka">training drops</span>. the weeks you trained three times, spending fell
<span class="km">40%</span> and your mood held. training is the lever, so
<span class="key">protect three sessions</span>.</p>
```

Note: the underline color follows the takeaway's mood. The examples use mint (a forward
move). If the one move is itself a caution, swap to amber: `border-bottom-color:var(--amber-bd)`
and `color:var(--amber-hi)`. Keep exactly one `.key` per card.

---

## 4. The one-tap action bubbles

Two buttons, max. A colored "apply" action, and the iris "talk deeper in Claude" doorway.
Outline by default, floods to a solid fill on hover with a soft lift. Color-coded:
mint for a forward move, amber for a gentle correction.

```css
.acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:22px}
.act{display:inline-flex;align-items:center;gap:8px;font:500 0.87rem var(--body);
  background:transparent;border:1px solid;border-radius:12px;padding:12px 17px;cursor:pointer;
  white-space:nowrap;
  transition:color .26s var(--ease),background .26s var(--ease),border-color .26s var(--ease),
             transform .22s var(--ease),box-shadow .3s var(--ease)}
.act svg{width:15px;height:15px;flex:none;transition:transform .42s var(--spring)}
.act:active{transform:scale(.97)}

.a-mint{color:var(--mint-hi);border-color:rgba(110,231,183,0.4)}
.a-mint:hover{color:var(--mint-ink);background:var(--mint);border-color:var(--mint);
  transform:translateY(-2px);box-shadow:0 12px 28px -15px var(--mint-glow)}
.a-mint:hover svg{transform:scale(1.16)}

.a-amber{color:var(--amber-hi);border-color:var(--amber-bd)}
.a-amber:hover{color:var(--amber-ink);background:var(--amber);border-color:var(--amber);
  transform:translateY(-2px);box-shadow:0 12px 28px -15px var(--amber-glow)}
.a-amber:hover svg{transform:scale(1.12)}

.a-ghost{color:var(--muted-strong);border-color:var(--border)}   /* the soft dismiss: "got it" */
.a-ghost:hover{color:var(--fg);border-color:var(--border-strong)}

/* the Claude doorway: iris, spark glyph, rotates on hover */
.cl-b{display:inline-flex;align-items:center;gap:9px;font:500 0.87rem var(--body);
  color:var(--iris-hi);background:transparent;border:1px solid rgba(167,139,250,0.44);
  border-radius:12px;padding:12px 17px;cursor:pointer;transition:.26s var(--ease)}
.cl-b svg{width:15px;height:15px;transition:.4s var(--spring)}
.cl-b:hover{color:var(--iris-ink);background:var(--iris);border-color:var(--iris);
  transform:translateY(-2px);box-shadow:0 12px 28px -15px var(--iris-glow)}
.cl-b:hover svg{transform:rotate(90deg) scale(1.1)}
```

Markup:
```html
<div class="acts">
  <button class="act a-mint">{spark-or-action-glyph} protect 3 sessions</button>
  <button class="cl-b">{spark-glyph} talk deeper in Claude</button>
</div>
```

Pair an action with a soft out. Caution cards offer a `.a-ghost` "got it" / "still right" so
the user can dismiss without doing anything. Never trap them in a to-do.

### Inline SVG glyphs used (copy as-is)

```html
<!-- the Vee mark (a check/V), goes in .vt-echo -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l7 11 7-11"/></svg>
<!-- spark (the "talk in Claude" mark) -->
<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z"/><path d="M18.7 13.6l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8z"/></svg>
<!-- clock (the "watched" stamp) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
<!-- up / down triangles for .gimp goal-impact -->
<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l8 13H4z"/></svg>   <!-- up -->
<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 19L4 6h16z"/></svg>   <!-- down -->
```

---

## 5. Full copy-paste card

```html
<div class="vc">
  <div class="vt-top">
    <div class="vt-echo">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l7 11 7-11"/></svg>
    </div>
    <div class="vt-tag">Vitality noticed</div>
    <div class="vt-spacer"></div>
    <div class="vt-watched">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
      watched &middot; money + training + mood &middot; 6wk
    </div>
  </div>

  <div class="vt-body">
    <p class="vt-lead">your <span class="ka">spending climbs</span> the weeks your
      <span class="ka">training drops</span>, and both spike when work stress does. it is one
      spiral, not three problems. the weeks you trained three times, spending fell
      <span class="km">40%</span> and your mood held. training is the lever, so
      <span class="key">protect three sessions</span>.</p>

    <div class="impact">
      <span class="il">moves your goals</span>
      <span class="gimp up"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l8 13H4z"/></svg>get lean</span>
      <span class="gimp up"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l8 13H4z"/></svg>feel on top</span>
    </div>

    <div class="chips">
      <span class="chip a">spend +chf 210 low-train wks</span>
      <span class="chip m">&minus;40% when 3+ sessions</span>
      <span class="chip m">mood held</span>
    </div>

    <div class="acts">
      <button class="act a-mint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
        protect 3 sessions
      </button>
      <button class="cl-b">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z"/><path d="M18.7 13.6l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8z"/></svg>
        talk deeper in Claude
      </button>
    </div>
  </div>
</div>
```

---

## 6. "One at a time, never a wall" (cozy progressive disclosure)

The deepest rule of Vee. The system is holding many insights, but it only ever shows ONE.
The rest wait behind a quiet, warm "show me another". Never dump a list. Never a feed.

- Show a single card. Below it, a tiny pager (dots) and a soft "show me another" pill.
- When the user taps, swap the card content and re-run a randomized entrance (see below).
- Below everything, a dashed reassurance: "Vitality is holding more for you. one at a time,
  never a wall."

```html
<div class="cycle">
  <div class="pager" id="pager"></div>   <!-- dots, one per held insight -->
  <button class="another" id="another">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
    show me another
  </button>
</div>
<div class="quiet">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l7 11 7-11"/></svg>
  <span>Vitality is holding <b>more</b> for you. one at a time, never a wall.</span>
</div>
```

```css
.cycle{display:flex;align-items:center;gap:14px;margin-top:18px}
.pager{display:flex;gap:7px}
.pager i{width:7px;height:7px;border-radius:50%;background:rgba(167,139,250,0.28);transition:.3s var(--ease)}
.pager i.on{background:var(--iris-hi);box-shadow:0 0 9px -1px var(--iris-glow);transform:scale(1.12)}
.another{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font:500 0.78rem var(--body);
  color:var(--muted-strong);background:transparent;border:1px solid var(--border);border-radius:999px;
  padding:8px 14px;cursor:pointer;transition:.24s var(--ease)}
.another svg{width:13px;height:13px;transition:transform .5s var(--spring)}
.another:hover{color:var(--iris-hi);border-color:rgba(167,139,250,0.42);transform:translateY(-1px)}
.another:hover svg{transform:rotate(160deg)}
.quiet{display:flex;align-items:center;gap:11px;margin-top:26px;padding:14px 16px;
  border:1px dashed var(--border-strong);border-radius:14px;color:var(--muted);font-size:0.86rem;
  background:rgba(255,255,255,0.01)}
.quiet svg{flex:none;width:16px;height:16px;color:var(--iris-hi);opacity:.8}
.quiet b{color:var(--muted-strong);font-weight:500}
```

Vanilla JS cycle (data-driven, re-renders one card per tap):
```js
var NOTICES = [ /* {watched, leadHTML, action:{cls,label}} ... */ ];
var idx = 0;
function render(i){
  // build hero.innerHTML from NOTICES[i], then re-run a random entrance:
  var ENTR = ['eRise','eBloom','eGlide','eUnfold','eTilt'];
  var pick = ENTR[Math.floor(Math.random()*ENTR.length)];
  hero.style.animation = 'none'; void hero.offsetWidth;       // reflow to restart
  hero.style.animation = pick + ' ' + (0.62 + Math.random()*0.18).toFixed(3) + 's var(--spring) both';
  // light the matching pager dot
}
document.getElementById('another').addEventListener('click', function(){
  idx = (idx + 1) % NOTICES.length; render(idx);
});
render(0);
```

A second face of the same rule: a tappable accordion where only one row opens at a time.
Open one, the others close. Same "never a wall" discipline, applied to a list of goals.

```js
// open one, close the rest
row.addEventListener('click', function(){
  var wasOpen = row.classList.contains('open');
  document.querySelectorAll('.row.open').forEach(function(r){ r.classList.remove('open'); });
  if(!wasOpen) row.classList.add('open');
});
```

---

## 7. Entrance animations (the "found / lock-on" feel)

Cards never just appear. They arrive softly, like the system locked onto something. Keep them
slow (0.6 to 0.85s) and springy. Randomize across a small set so a re-shown card feels alive.
Always respect `prefers-reduced-motion`.

```css
@keyframes eRise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes eBloom{0%{opacity:0;transform:scale(.94)}62%{opacity:1;transform:scale(1.012)}100%{opacity:1;transform:scale(1)}}
@keyframes eGlide{from{opacity:0;transform:translateY(16px) scale(.987)}to{opacity:1;transform:none}}
@keyframes eUnfold{from{opacity:0;transform:perspective(800px) rotateX(-7deg) translateY(13px)}to{opacity:1;transform:perspective(800px) rotateX(0) translateY(0)}}
@keyframes eTilt{0%{opacity:0;transform:rotate(-1.2deg) translateY(17px) scale(.98)}65%{opacity:1;transform:rotate(.25deg) translateY(0) scale(1.003)}100%{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){ .vc{animation:none !important;opacity:1 !important} }
```

Optional "lock-on" flourish for a hero arrival: a one-shot ring pulse on the card border,
plus a blur-to-sharp landing. Use sparingly, only for the single headline insight.
```css
.arrive.in{animation:arrive 1.05s var(--spring) both}
@keyframes arrive{0%{opacity:0;transform:translateY(28px) scale(.965);filter:blur(8px)}
  60%{opacity:1;filter:blur(0)}100%{opacity:1;transform:none;filter:blur(0)}}
```

---

## 8. The voice (write the lead like this)

Warm, plain, lowercase, no shame, no jargon. Vee talks like a friend who has read your whole
file and roots for you. The sentence does three things: names the underlying thing, gives the
ONE move, names which goal it just moved.

Voice rules:
- **Lowercase, conversational.** "you are eating a little over most days". Not "Caloric surplus detected."
- **No shame, ever.** Reframe a slip as data, not failure. "that is your body talking, not you
  failing." "i do not think this is laziness." Always offer a graceful out ("give me grace",
  "still right", "got it").
- **Tie to the user's own goal,** in their own words. "you told me you want to get lean."
- **One move, not a list.** End on a single, doable thing, wrapped in the `.key` underline.
- **Use real numbers as proof,** then hand the depth to Claude. The app shows you; Claude works
  it out with you. The deep tap is "talk deeper in Claude".
- **Celebrate genuinely** when earned. "you are winning, and grinding yourself down believing
  you are not."
- **Never red, never alarm.** Caution is amber and gentle. Good is mint.
- **No em dashes.** Use periods or commas. No emojis. Mono is for labels only, never for the voice.

Good lead examples (lift the cadence, not the literal copy):
- "you have logged every workout for three weeks, and skipped every weigh-in. i do not think
  this is laziness. step on the scale once this week and the fear stops steering."
- "you keep telling me you feel behind on the business. your own logs disagree. you shipped
  something 18 of the last 21 days, your best run yet. you are winning."
- "the days you felt flattest this week were the nights your sleep dipped under 80%. that's your
  body talking, not you failing."

Bad (do not write like this): "Alert: protein intake 47% below target. Action required."

---

## 9. Atmosphere (optional, makes a tile feel like home)

A faint iris top-glow and a mint bottom-glow plus a barely-there grain. Pure CSS, no assets.
```css
body{background:var(--bg);color:var(--fg);position:relative;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(72% 30vh at 50% -3%, rgba(167,139,250,0.13), transparent 70%),
             radial-gradient(46% 32% at 100% 102%, rgba(31,77,61,0.12), transparent 70%)}
body::after{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.028;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
```

The eyebrow + serif title pattern that opens a Vee surface:
```html
<div class="eyebrow-top"><span class="dot"></span>Vitality &middot; Vee</div>
<h1 class="title">Howdy, Alex.</h1>
```
```css
.eyebrow-top{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:0.66rem;
  letter-spacing:0.22em;text-transform:uppercase;color:var(--iris-hi)}
.eyebrow-top .dot{width:4px;height:4px;border-radius:50%;background:var(--iris);box-shadow:0 0 7px var(--iris)}
.title{font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(2.3rem,7vw,3.4rem);
  line-height:1.02;letter-spacing:-0.02em}
```
