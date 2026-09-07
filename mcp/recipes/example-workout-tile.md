# Worked example: a Fuel-grade tile (Workout logger, set by set)

This is the ceiling, not the floor. Most of the kit teaches one idea at a time. This file is ONE complete, sealed, copy-paste tile that ties everything together for the workout domain: a full-screen, multi-section, responsive, on-brand instrument that logs sets, times your rest, shows your training week, celebrates finishing, persists through the host bridge, reports one clean number into Vee, and passes `check_tile` with zero errors and zero warnings. Read it when a builder asks for a real training module rather than a rep counter. Steal the shell, swap the domain.

The example is a personal workout logger. The same shape powers a habit tracker, a reading log, a meditation timer, anything with a headline number, an add form, a live list, a compact history strip, and a felt moment when you commit. The domain is just paint. For the finance version of this same ceiling see `example-markets-tile.md`.

---

## What makes it Fuel-grade (the checklist this tile satisfies)

A trivial counter is one number and two buttons. A Fuel-grade tile earns its place on the dashboard the way the real Fitness logger does. This one hits every mark:

- **Multi-section layout.** A header with a title and a settings gear, a hero readout with a gliding session bar, an add form, a live list of today's sets grouped by exercise, a compact seven-day training week, an actions row with Finish, a settings drawer, a footer, a floating rest timer, and a full-screen celebration. Distinct sections, one calm rhythm.
- **Responsive, small on the grid AND opened full.** A centered `max-width` column, `clamp()` type that scales with the viewport, flex rows that wrap, a week strip that stays even at any width, and a narrow breakpoint that reflows the add form. It reads well in a small grid cell and full-screen.
- **A real instrument, not a form.** You log a set and the newest pill sweeps mint. Adding a set floats a wall-clock rest countdown that self-corrects if the tab sleeps. The week strip animates its bars up. Finishing takes over the screen with an earned check. Every action lands with color and motion that carry meaning.
- **Honest, warm states.** An empty day invites the first set, never a broken screen. A missing field asks kindly through one calm line, never a red stack trace. Removing a real set is a single tap on its own control, and red is never used for a light day, only mint for done and amber for caution.
- **The bug-lessons baked in.** Local date keys, transform/opacity-only motion, host-bridge persistence with a standalone localStorage fallback wrapped in try/catch, saves held behind a loaded flag, inputs clamped, user text escaped before it lands in HTML, glyphs drawn as inline SVG, mint `::selection`, a `prefers-reduced-motion` escape hatch. These are the `gotchas.md` rules, already applied.
- **One report, done right.** It reports a single stream (sets logged today, `kind:'count'`) so it feeds the dashboard and the optional Vee tile, and only when the number is real.

---

## The full tile

This is the whole file. It is sealed: no libraries, no CDN, no external CSS, no runtime fonts. Paste it into `/app/create` or `upload_tile` it as-is, then read the tour below to learn the moves.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Train</title>
<style>
:root{
  --mint:#6EE7B7; --mint-2:#3ddc97; --mint-soft:#9ff0cf; --mint-glow:rgba(110,231,183,.4);
  --amber:#F59E0B; --gold:#f1cf7a;
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
.big{
  font-size:clamp(44px,13vw,74px);font-weight:600;line-height:1.05;font-variant-numeric:tabular-nums;
  background:linear-gradient(180deg,#fff,#9ff0cf);-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;margin-top:2px;
}
.p-row{display:flex;align-items:center;gap:12px;margin-top:16px}
.p-track{flex:1;height:6px;background:rgba(255,255,255,.07);border-radius:999px;overflow:hidden}
.pfill{
  height:100%;transform-origin:left;transform:scaleX(0);border-radius:999px;
  background:linear-gradient(90deg,var(--mint-2),var(--mint-soft));
  transition:transform .5s cubic-bezier(.16,1,.3,1);
}
.p-label{font-family:var(--serif);font-style:italic;font-size:.9rem;color:var(--dim);white-space:nowrap}
.p-label.hit{color:var(--mint)}

/* add form */
.add{display:flex;gap:8px;flex-wrap:wrap}
.add input{
  background:var(--card);border:1px solid var(--rule);border-radius:12px;
  padding:12px 14px;color:var(--ink);font:15px var(--body);outline:none;transition:border-color .18s;
}
.add input:focus{border-color:var(--mint-glow)}
.add .name{flex:1 1 100%;min-width:0}
.add .num{flex:1;min-width:0;text-align:center}
.btn{
  font-family:inherit;cursor:pointer;border-radius:12px;font-size:14px;font-weight:700;padding:12px 18px;
  border:1px solid var(--mint);background:var(--mint);color:#042a1c;
  transition:transform .18s cubic-bezier(.16,1,.3,1),background-color .18s,border-color .18s;
}
.btn:hover{background:var(--mint-soft)}
.btn:active{transform:scale(.96)}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--rule)}
.btn.ghost:hover{color:var(--mint);border-color:var(--mint-glow)}
.add .btn{flex:0 0 auto;display:grid;place-items:center;padding:12px 16px}
.add .btn svg{width:16px;height:16px}

/* today list */
.list{display:flex;flex-direction:column;gap:10px}
.ex-card{border:1px solid var(--rule);border-radius:16px;background:var(--card);padding:13px 14px;animation:rise .42s both}
.ex-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
.ex-name{font-family:var(--serif);font-style:italic;font-size:1.15rem}
.ex-count{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);flex:none}
.set-list{display:flex;flex-direction:column;gap:7px}
.set-pill{
  position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;padding:11px 13px;
  border:1px solid var(--rule);border-radius:12px;background:rgba(255,255,255,.022);
  transition:background-color .2s,border-color .2s,transform .2s;
}
.set-pill:hover{border-color:var(--mint-glow);background:rgba(110,231,183,.05)}
.s-idx{font-family:var(--serif);font-style:italic;color:var(--faint);width:16px;flex:none}
.s-val{font-weight:600;font-variant-numeric:tabular-nums}
.s-unit{font-family:var(--serif);font-style:italic;font-size:.72em;color:var(--dim);margin-left:2px}
.s-x{color:var(--faint);margin:0 6px}
.s-spacer{flex:1}
.s-del{
  flex:none;width:28px;height:28px;border-radius:8px;border:1px solid var(--rule);background:transparent;
  color:var(--faint);display:grid;place-items:center;cursor:pointer;
  transition:color .18s,border-color .18s,background-color .18s;
}
.s-del:hover{color:var(--amber);border-color:rgba(245,158,11,.5)}
.s-del:active{transform:scale(.9)}
.s-del svg{width:13px;height:13px}
.set-pill.flash::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(110,231,183,.3),transparent);
  transform:translateX(-100%);animation:sweep .8s cubic-bezier(.16,1,.3,1) forwards;
}
.empty{text-align:center;color:var(--faint);font-size:13px;padding:22px 12px;border:1px dashed var(--rule);border-radius:14px}

/* training week */
.week-wrap{border-top:1px solid var(--rule);padding-top:16px}
.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--mint);opacity:.85;margin-bottom:14px}
.week{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}
.wk-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.wk-bar-wrap{height:56px;width:100%;display:flex;align-items:flex-end;justify-content:center}
.wk-bar{
  width:70%;max-width:22px;border-radius:6px;transform-origin:bottom;
  background:linear-gradient(180deg,rgba(110,231,183,.5),rgba(110,231,183,.14));
  animation:barGrow .5s cubic-bezier(.16,1,.3,1) both;
}
.wk-bar.now{background:linear-gradient(180deg,var(--mint),var(--mint-2))}
.wk-bar.zero{background:rgba(255,255,255,.05)}
.wk-lab{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.wk-lab.now{color:var(--mint)}
.wk-n{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dim);min-height:14px}

/* actions */
.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.msg{font-size:12px;color:var(--faint);min-height:16px}
.msg.warn{color:var(--amber)}

/* settings drawer */
.settings{
  border:1px solid rgba(110,231,183,.26);border-radius:16px;background:rgba(110,231,183,.05);
  padding:16px;display:flex;flex-direction:column;gap:12px;text-align:left;animation:rise .3s both;
}
.settings h3{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);font-weight:700}
.cfg{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.9rem;color:var(--dim)}
.cfg .in{display:inline-flex;align-items:center;gap:6px}
.cfg input{
  width:74px;background:var(--card);border:1px solid var(--rule);border-radius:10px;
  padding:9px 11px;color:var(--ink);font:.95rem var(--body);outline:none;text-align:center;transition:border-color .18s;
}
.cfg input:focus{border-color:var(--mint-glow)}
.cfg .suf{font-size:.72rem;color:var(--faint)}
.settings p{font-size:.78rem;color:var(--dim);line-height:1.55}

.foot{text-align:center;font-size:11px;color:var(--faint)}

/* rest timer (floating) */
.rest-pill{
  position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:40;
  display:flex;align-items:center;gap:12px;padding:11px 16px;min-width:min(320px,86vw);
  background:rgba(8,16,12,.94);border:1px solid rgba(110,231,183,.35);border-radius:999px;
  box-shadow:0 8px 32px rgba(0,0,0,.5);animation:restIn .32s cubic-bezier(.16,1,.3,1);
}
.rest-cap{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.rest-time{flex:1;text-align:center;font-family:var(--serif);font-style:italic;font-size:1.3rem;color:var(--mint);font-variant-numeric:tabular-nums}
.rest-skip{background:none;border:none;cursor:pointer;font-family:var(--serif);font-style:italic;font-size:.9rem;color:var(--dim);transition:color .18s}
.rest-skip:hover{color:var(--mint)}
.rest-go{display:none;flex:1;align-items:center;justify-content:center;gap:8px;font-family:var(--serif);font-style:italic;font-size:1.2rem;color:#042a1c;font-weight:600}
.rest-go svg{width:20px;height:20px}
.rest-pill.done{background:var(--mint);border-color:var(--mint);animation:restFlood 1.2s cubic-bezier(.16,1,.3,1) forwards}
.rest-pill.done .rest-cap,.rest-pill.done .rest-time,.rest-pill.done .rest-skip{display:none}
.rest-pill.done .rest-go{display:inline-flex}

/* celebration */
.celebrate{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);animation:fade .3s ease}
.cel-card{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;animation:celIn .5s cubic-bezier(.16,1,.3,1) both}
.cel-ring{
  width:84px;height:84px;border-radius:999px;display:grid;place-items:center;color:#042a1c;
  background:var(--mint);box-shadow:0 0 60px rgba(110,231,183,.45);animation:ringPop .6s cubic-bezier(.34,1.56,.64,1) both;
}
.cel-ring svg{width:40px;height:40px}
.cel-title{font-family:var(--serif);font-style:italic;font-size:2.2rem}
.cel-sub{font-size:.9rem;color:var(--dim)}
.cel-sub b{color:var(--mint);font-weight:600;font-variant-numeric:tabular-nums}

@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sweep{to{transform:translateX(100%)}}
@keyframes barGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes restIn{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes restFlood{0%{transform:translateX(-50%) scale(1)}18%{transform:translateX(-50%) scale(1.05)}36%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes celIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes ringPop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
@media (max-width:420px){.add .num{flex:1 1 calc(50% - 4px)}.sub{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <div class="title">Train</div>
      <div class="sub">today's session</div>
    </div>
    <button class="gear" id="gear" type="button" aria-label="settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>

  <div class="hero">
    <div class="cap">sets logged today</div>
    <div class="big" id="big">0</div>
    <div class="p-row">
      <div class="p-track"><div class="pfill" id="pfill"></div></div>
      <span class="p-label" id="plabel">0 of 16 sets</span>
    </div>
  </div>

  <div class="settings" id="settings" hidden>
    <h3>session settings</h3>
    <div class="cfg"><span>rest between sets</span><span class="in"><input id="restlen" type="number" min="0" max="600" inputmode="numeric" aria-label="rest seconds"><span class="suf">sec</span></span></div>
    <div class="cfg"><span>daily set goal</span><span class="in"><input id="goalin" type="number" min="1" max="60" inputmode="numeric" aria-label="daily set goal"><span class="suf">sets</span></span></div>
    <button class="btn" id="savecfg" type="button" style="align-self:flex-start">save</button>
    <p>Rest starts a countdown after each set. The goal fills your session bar. Both live only in this tile.</p>
  </div>

  <div class="add">
    <input id="exname" class="name" list="lifts" type="text" placeholder="exercise" autocomplete="off" maxlength="40" aria-label="exercise name">
    <input id="exwt" class="num" type="number" inputmode="decimal" min="0" step="any" placeholder="kg" aria-label="weight in kg">
    <input id="exreps" class="num" type="number" inputmode="numeric" min="0" step="1" placeholder="reps" aria-label="reps">
    <button class="btn" id="addbtn" type="button" aria-label="add set">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </div>
  <datalist id="lifts">
    <option value="Barbell bench"></option>
    <option value="Incline DB press"></option>
    <option value="Standing OHP"></option>
    <option value="DB lateral raise"></option>
    <option value="Pull-ups"></option>
    <option value="Barbell row"></option>
    <option value="Barbell curl"></option>
    <option value="Tricep pushdown"></option>
    <option value="Back squat"></option>
    <option value="Romanian deadlift"></option>
    <option value="Hip thrust"></option>
    <option value="Plank"></option>
  </datalist>

  <div class="list" id="today"></div>

  <div class="week-wrap">
    <div class="eyebrow">this week</div>
    <div class="week" id="week"></div>
  </div>

  <div class="actions">
    <div class="msg" id="msg"></div>
    <button class="btn ghost" id="finish" type="button">finish session</button>
  </div>

  <div class="foot">every set saves as you go, only on this device and your dashboard</div>
</div>

<div class="rest-pill" id="rest" hidden>
  <span class="rest-cap">rest</span>
  <span class="rest-time" id="resttime">1:30</span>
  <button class="rest-skip" id="restskip" type="button">skip</button>
  <span class="rest-go" id="restgo"></span>
</div>

<div class="celebrate" id="celebrate" hidden>
  <div class="cel-card">
    <div class="cel-ring">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
    </div>
    <div class="cel-title">nice work</div>
    <div class="cel-sub"><b id="celn">0</b> sets logged today</div>
  </div>
</div>

<script>
/* ---- the host bridge: save/load/report, with a standalone fallback ---- */
var Vitality = (function () {
  var waiters = {}, LS = 'vitality-workout-tile';
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
function dayKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function today(){ return dayKey(new Date()); }

/* ---- inline SVG glyph, never emoji or a unicode check ---- */
var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
var XMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* ---- state. sessions: { 'YYYY-MM-DD': [{name, weight, reps}] } ---- */
var state = { restLen:90, goal:16, sessions:{} };
var loaded = false, restTimer = null, restEndsAt = 0, celTimer = null, flashIdx = -1, msgTimer = null;

function todaySets(){ return state.sessions[today()] || []; }
function fmtNum(n){ return (Math.round(n * 100) / 100).toString(); }
function mmss(s){ var m = Math.floor(s/60), ss = s % 60; return m + ':' + String(ss).padStart(2,'0'); }
function esc(s){ return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

function flash(text, warn){
  var m = document.getElementById('msg');
  m.textContent = text || '';
  m.className = 'msg' + (warn ? ' warn' : '');
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
  if (text && !warn) msgTimer = setTimeout(function () { m.textContent = ''; }, 2400);
}

/* ---- render: hero + session bar, today's sets grouped by lift, the week ---- */
function renderAll(){ renderHero(); renderToday(); renderWeek(); }

function renderHero(){
  var n = todaySets().length, goal = state.goal || 16;
  document.getElementById('big').textContent = n;
  var pct = goal > 0 ? Math.min(1, n / goal) : 0;
  document.getElementById('pfill').style.transform = 'scaleX(' + pct + ')';
  var lbl = document.getElementById('plabel');
  if (goal > 0 && n >= goal) { lbl.textContent = n + ' sets, goal hit'; lbl.className = 'p-label hit'; }
  else { lbl.textContent = n + ' of ' + goal + ' sets'; lbl.className = 'p-label'; }
}

function grouped(sets){
  var order = [], map = {};
  sets.forEach(function (s, i) {
    if (!map[s.name]) { map[s.name] = []; order.push(s.name); }
    map[s.name].push({ set:s, idx:i });
  });
  return order.map(function (n) { return { name:n, items:map[n] }; });
}

function renderToday(){
  var sets = todaySets(), wrap = document.getElementById('today');
  if (!sets.length) {
    wrap.innerHTML = '<div class="empty">log your first set below and today starts here</div>';
    flashIdx = -1;
    return;
  }
  wrap.innerHTML = '';
  grouped(sets).forEach(function (g, gi) {
    var card = document.createElement('div');
    card.className = 'ex-card';
    card.style.animationDelay = (gi * 0.05) + 's';
    var pills = g.items.map(function (it, si) {
      var flash = it.idx === flashIdx ? ' flash' : '';
      return '<div class="set-pill' + flash + '">' +
        '<span class="s-idx">' + (si + 1) + '</span>' +
        '<span class="s-val">' + fmtNum(it.set.weight) + '<span class="s-unit">kg</span><span class="s-x">' + '×' + '</span>' + it.set.reps + '</span>' +
        '<span class="s-spacer"></span>' +
        '<button class="s-del" type="button" data-del="' + it.idx + '" aria-label="remove set">' + XMARK + '</button>' +
      '</div>';
    }).join('');
    var plural = g.items.length > 1 ? 's' : '';
    card.innerHTML =
      '<div class="ex-head"><span class="ex-name">' + esc(g.name) + '</span><span class="ex-count">' + g.items.length + ' set' + plural + '</span></div>' +
      '<div class="set-list">' + pills + '</div>';
    wrap.appendChild(card);
  });
  flashIdx = -1;   // one sweep only, never re-fire on the next render
}

function renderWeek(){
  var wrap = document.getElementById('week');
  var base = new Date(); base.setHours(0,0,0,0);
  var days = [], counts = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(base); d.setDate(base.getDate() - i);
    days.push(d); counts.push((state.sessions[dayKey(d)] || []).length);
  }
  var max = Math.max(1, Math.max.apply(null, counts));
  var letters = ['S','M','T','W','T','F','S'];
  wrap.innerHTML = '';
  days.forEach(function (d, i) {
    var c = counts[i], isToday = dayKey(d) === today();
    var h = c > 0 ? Math.max(8, Math.round(c / max * 100)) : 4;
    var col = document.createElement('div');
    col.className = 'wk-col';
    col.innerHTML =
      '<div class="wk-bar-wrap"><div class="wk-bar' + (isToday ? ' now' : '') + (c === 0 ? ' zero' : '') + '" style="height:' + h + '%;animation-delay:' + (i * 0.04) + 's"></div></div>' +
      '<div class="wk-lab' + (isToday ? ' now' : '') + '">' + letters[d.getDay()] + '</div>' +
      '<div class="wk-n">' + (c || '') + '</div>';
    wrap.appendChild(col);
  });
}

/* ---- the one report: today's set count, only when it is real ---- */
function reportSets(){
  var n = todaySets().length;
  if (n > 0) {
    Vitality.report({ key:'sets', label:'Sets logged', value:n, date:today(), kind:'count', goalDirection:'up' });
  }
}

/* ---- logging a set ---- */
function addSet(){
  var nEl = document.getElementById('exname'), wEl = document.getElementById('exwt'), rEl = document.getElementById('exreps');
  var name = (nEl.value || '').trim().slice(0, 40);
  var w = parseFloat(wEl.value), r = parseInt(rEl.value, 10);
  if (!name) { flash('name the exercise', true); nEl.focus(); return; }
  if (isNaN(w) || w < 0) { flash('add the weight', true); wEl.focus(); return; }
  if (isNaN(r) || r <= 0) { flash('add the reps', true); rEl.focus(); return; }
  if (w > 2000) w = 2000;    // clamp an absurd typo, never store it raw
  if (r > 1000) r = 1000;
  var k = today();
  if (!state.sessions[k]) state.sessions[k] = [];
  state.sessions[k].push({ name:name, weight:w, reps:r });
  flashIdx = state.sessions[k].length - 1;   // sweep the newest pill
  wEl.value = fmtNum(w); rEl.value = '';      // keep the load, clear reps for the next set
  persist(); renderAll(); reportSets();
  startRest();
  rEl.focus();
}

function removeSet(idx){
  var k = today();
  if (state.sessions[k]) {
    state.sessions[k].splice(idx, 1);
    if (!state.sessions[k].length) delete state.sessions[k];
  }
  persist(); renderAll(); reportSets();
}

/* ---- the rest timer, driven off a wall-clock end so a slept tab self-corrects ---- */
function startRest(){
  if (!state.restLen || state.restLen <= 0) return;
  restEndsAt = Date.now() + state.restLen * 1000;
  var pill = document.getElementById('rest');
  pill.hidden = false; pill.className = 'rest-pill';
  tickRest();
  if (restTimer) clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
}
function tickRest(){
  var left = Math.round((restEndsAt - Date.now()) / 1000);
  if (left <= 0) { restDone(); return; }
  document.getElementById('resttime').textContent = mmss(left);
}
function restDone(){
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  document.getElementById('rest').className = 'rest-pill done';
  try { if (navigator.vibrate) navigator.vibrate([140, 70, 140]); } catch (e) {}
  setTimeout(function () { var p = document.getElementById('rest'); p.hidden = true; p.className = 'rest-pill'; }, 1200);
}
function skipRest(){
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  var p = document.getElementById('rest'); p.hidden = true; p.className = 'rest-pill';
}

/* ---- finish: celebrate the session, calm auto-return ---- */
function showCelebrate(n){
  document.getElementById('celn').textContent = n;
  document.getElementById('celebrate').hidden = false;
  if (celTimer) clearTimeout(celTimer);
  celTimer = setTimeout(hideCelebrate, 3600);
}
function hideCelebrate(){
  document.getElementById('celebrate').hidden = true;
  if (celTimer) { clearTimeout(celTimer); celTimer = null; }
}

/* ---- wiring: every handler through addEventListener, no inline on* ---- */
document.getElementById('gear').addEventListener('click', function () {
  var s = document.getElementById('settings');
  s.hidden = !s.hidden;
  if (!s.hidden) document.getElementById('restlen').focus();   // focus, never select (no blue block)
});
document.getElementById('savecfg').addEventListener('click', function () {
  var rl = parseInt(document.getElementById('restlen').value, 10);
  var gl = parseInt(document.getElementById('goalin').value, 10);
  if (!isNaN(rl) && rl >= 0 && rl <= 600) state.restLen = rl;
  if (!isNaN(gl) && gl >= 1 && gl <= 60) state.goal = gl;
  document.getElementById('restlen').value = state.restLen;
  document.getElementById('goalin').value = state.goal;
  persist(); document.getElementById('settings').hidden = true; renderHero(); flash('saved');
});
document.getElementById('addbtn').addEventListener('click', addSet);
document.getElementById('exname').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('exwt').focus(); } });
document.getElementById('exwt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('exreps').focus(); } });
document.getElementById('exreps').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addSet(); } });
document.getElementById('restskip').addEventListener('click', skipRest);
document.getElementById('finish').addEventListener('click', function () {
  var n = todaySets().length;
  if (!n) { flash('log a set first', true); return; }
  reportSets(); showCelebrate(n);
});
document.getElementById('celebrate').addEventListener('click', hideCelebrate);
document.getElementById('today').addEventListener('click', function (e) {
  var del = e.target.closest('[data-del]');
  if (del) removeSet(parseInt(del.getAttribute('data-del'), 10));
});

/* ---- hydrate once, then allow saves (never persist empty defaults over real data) ---- */
Vitality.load().then(function (saved) {
  if (saved && typeof saved === 'object') {
    if (typeof saved.restLen === 'number') state.restLen = saved.restLen;
    if (typeof saved.goal === 'number') state.goal = saved.goal;
    if (saved.sessions && typeof saved.sessions === 'object') state.sessions = saved.sessions;
  }
  document.getElementById('restlen').value = state.restLen;
  document.getElementById('goalin').value = state.goal;
  document.getElementById('restgo').innerHTML = CHECK + '<span>go</span>';
  loaded = true;
  renderAll();
  reportSets();
});
function persist(){ if (loaded) Vitality.save({ restLen:state.restLen, goal:state.goal, sessions:state.sessions }); }
</script>
</body>
</html>
```

---

## The guided tour (what to copy, and why)

**The shell is the lesson.** A header bar, a hero number, a session bar, an add form, a live list, a compact week strip, an actions row, a settings drawer, a footer, plus a floating rest pill and a finish celebration, all stacked in one centered `max-width:520px` column with a single `gap`. Swap the domain and the shell carries over wholesale: a habit tile lists streaks, a reading tile lists books, a hydration tile lists glasses. The headline number, the add form, and the live list are the three beats of almost every rich tile; the week strip and the finish moment are what turn a tracker into an instrument.

**Responsiveness comes from three cheap moves**, not a framework: a centered column with a `max-width`, `clamp()` on the type and the padding so nothing is fixed to one screen size, and `flex-wrap` plus one `@media (max-width:420px)` rule that lets the weight and reps fields drop to their own line and hides the eyebrow label when space is tight. The week strip is a flex row of equal `flex:1` columns, so seven bars stay even at any width. That is the whole trick behind "small on the grid, opens full."

**Every action lands.** Logging a set flags the newest pill with `flash`, and a mint gradient sweeps across it once (a `translateX` on an `::after`, transform-only, so it holds 60fps). Adding a non-final set floats the rest pill and starts a countdown. The week bars animate up with `barGrow` (a `scaleY`, transform-only). Finishing takes over the screen with a springy check ring. This is the logger's core idea: one action, one felt response, and the color always carries the meaning.

**The rest timer is wall-clock, not a decrement.** `startRest()` stores `restEndsAt = Date.now() + restLen*1000` and every tick recomputes the remaining seconds from that epoch. A backgrounded tab that misses ticks self-corrects the instant it wakes, instead of drifting behind. When it reaches zero it floods mint, shows an inline SVG check and "go", and buzzes `navigator.vibrate` where supported, then fades out.

**Every state is honest and warm.** An empty day invites the first set rather than showing a blank. A missing field asks kindly through `flash(..., true)` in amber, never a red stack trace, and red is reserved for genuine destruction anyway, so a light training day is simply a short mint bar, never an alarm. Removing a set is a single deliberate tap on its own control.

**The bug-lessons are already applied.** `dayKey()` builds the date key from local getters, never `toISOString().slice`, which drifts a day. All motion is `transform`/`opacity` only, in both the `@keyframes` and the transitions (the session bar fills with `scaleX`, not an animated `width`, so it never trips the layout-motion rule). Persistence prefers the host bridge and falls back to localStorage only when the tile is opened standalone, every storage call wrapped in try/catch. Saves are held behind a `loaded` flag so the empty first paint never overwrites real saved data. The weight is clamped, the exercise name is length-capped and escaped with `esc()` before it lands in HTML. Glyphs are inline SVG. There is a mint `::selection` and a `prefers-reduced-motion` escape hatch.

**It reports exactly one number.** `reportSets()` emits today's set count as a single `count` stream, and only when there is at least one real set, so the dashboard and the optional Vee tile get a true number and never a fabricated zero. One tile, one stream. The literal `Vitality.report(` appears exactly once in the file; everything else calls the `reportSets()` helper.

---

## Swapping the domain

Keep the shell, change four things:

1. **The title, eyebrow, and hero caption.** "Train / today's session / sets logged today" becomes whatever the tile is.
2. **The row shape.** Here a card groups a lift and its set pills (`weight kg` times `reps`). For a habit tile a row is the habit and its streak; for a reading tile it is the book and its pages. The `grouped()` helper and the pill markup are the only pieces that know about sets.
3. **The felt moment.** The rest timer and the finish celebration are workout-flavoured. A meditation tile keeps the timer and drops the week bars; a habit tile keeps the week strip and drops the timer. Reuse the animation shells (`sweep`, `barGrow`, `restIn`, `celIn`), they are all transform/opacity and domain-agnostic.
4. **The report.** Pick the one number that matters and the `kind` that fits it (`count`, `duration`, `intake`, `measure`, `rating`, `money`, `done`), and report it only when it is real. This tile uses `count` for sets; a timed practice would use `duration` for minutes.

Everything else, the layout, the motion, the persistence, the states, the brand, the floor, is already correct. Build from here and the tile clears the Vitality bar by default. Run `check_tile` on your result and it should read PASS, zero errors, zero warnings, exactly as this one does.
