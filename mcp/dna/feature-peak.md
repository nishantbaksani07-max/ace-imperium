# Peak: energy curve, day schedule, substance log, mood dial, orbit gem (sealed-HTML)

Copy-paste recipes for a "when am I at my best" tile. Everything is inline HTML + CSS + vanilla JS + inline SVG. No libraries (the real Peak gem is Three.js; the orbit motif below is a CSS/SVG stand-in that reads the same).

Peak answers one question all day: how sharp are you right now, and when is your window. A circadian baseline curve, bent by what you log (caffeine, a workout, a drink) and your recovery, drives an energy dial, a schedule that auto-places hard tasks on your peak, and a coach.

## Color law (do not break)

```
mint  #6EE7B7   good, peak/solid, the line and the workout/caffeine lift
amber #F59E0B   caution: a tired hour, late caffeine, low water. NOT a failure
azure #5E9BFF   alt good accent (cool sibling of mint)
```

Never red for a non-destructive state. A low-energy hour is biology, not a fail: it reads tired/amber, never alarmed. Meaning rides on a word + shape too (`Peak`, `Tired`, an arrow `&#8593;`), never hue alone. Tier ladder, top to bottom: Peak, Solid (both mint), Tired (amber), Low, Drained.

Drop these tokens once on the page root:

```css
:root{
  --bg:#000; --fg:#fff; --card:rgba(255,255,255,.02);
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --mint:#6EE7B7; --mint-glow:rgba(110,231,183,0.4);
  --amber:#F59E0B; --azure:#5E9BFF;
  --serif:Georgia,'Instrument Serif',serif; --mono:'SF Mono',ui-monospace,monospace;
  --ease:cubic-bezier(0.2, 0.8, 0.2, 1); --ease-premium:cubic-bezier(.16,1,.3,1);
}
```

## 1. The energy curve (circadian baseline + your stack)

The spine of Peak. A 25-point score-by-hour curve (0-100) drawn as a filled area + stroked line, with a "now" dot. The curve is a built-in circadian shape that you bend by logging things.

The baseline (one value per hour 0..24). Dips post-lunch, rises late morning, secondary peak in the evening:

```js
var BASELINE=[18,12,10,14,16,22,30,42,55,68,75,70,62,50,44,48,56,64,72,84,92,88,64,38,18];
```

Each logged substance adds a contribution at every hour: zero before onset, a linear ramp up to its peak, then exponential decay by half-life. This is real pharmacokinetics, kept simple.

```js
// def = {amp, onset, peak, half}  hours decimal. log = {hour, dose, defaultDose}
function contribAt(h, log, def){
  var dt = h - log.hour;               // hours since you took it
  if (dt < def.onset) return 0;        // not kicked in yet
  var amp = def.amp * (log.dose/def.defaultDose);
  if (dt < def.peak)                   // ramp on
    return amp * (dt-def.onset)/(def.peak-def.onset);
  return amp * Math.pow(0.5,(dt-def.peak)/def.half);  // decay
}
// today's curve: baseline + every log, clamped 0..100
function buildCurve(logs, defs){
  return BASELINE.map(function(b,h){
    var v=b; logs.forEach(function(l){ v += contribAt(h,l,defs[l.key]); });
    return Math.max(0, Math.min(100, v));
  });
}
```

Render it as inline SVG that stretches to any width (`preserveAspectRatio="none"`):

```html
<div class="curve">
  <svg viewBox="0 0 720 180" preserveAspectRatio="none">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6EE7B7" stop-opacity=".28"/>
      <stop offset="100%" stop-color="#6EE7B7" stop-opacity="0"/>
    </linearGradient></defs>
    <path id="cArea" fill="url(#cg)"/>
    <path id="cLine" fill="none" stroke="#6EE7B7" stroke-width="2.5" stroke-linecap="round"/>
    <circle id="cNow" r="5" fill="#6EE7B7"/>
  </svg>
  <div class="curveAxis"><span>6a</span><span>noon</span><span>6p</span><span>midnight</span></div>
</div>
<script>
 (function(){
   var defs={coffee:{amp:16,onset:.25,peak:.75,half:5},
             workout:{amp:22,onset:0,peak:.5,half:1.5},
             alcohol:{amp:-10,onset:.2,peak:.75,half:1}};
   var logs=[{key:'coffee',hour:8,dose:95,defaultDose:95}];  // your day's stack
   var curve=buildCurve(logs,defs);
   var W=720,H=180,pad=12,n=curve.length;
   var pts=curve.map(function(v,i){ return [i/(n-1)*W, H-pad-(v/100)*(H-2*pad)]; });
   var d=pts.map(function(p,i){ return (i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1); }).join(' ');
   document.getElementById('cLine').setAttribute('d',d);
   document.getElementById('cArea').setAttribute('d',d+' L'+W+','+H+' L0,'+H+' Z');
   var now=new Date(); var nh=now.getHours()+now.getMinutes()/60;
   var i=Math.floor(nh), f=nh-i;
   var x=(nh/(n-1))*W, yv=curve[i]+(curve[Math.min(n-1,i+1)]-curve[i])*f;
   var y=H-pad-(yv/100)*(H-2*pad);
   var dot=document.getElementById('cNow'); dot.setAttribute('cx',x); dot.setAttribute('cy',y);
 })();
</script>
```

```css
.curve svg{width:100%;height:180px;display:block}
#cLine{filter:drop-shadow(0 0 6px rgba(110,231,183,.4))}
#cNow{filter:drop-shadow(0 0 9px #6EE7B7);animation:nowPulse 2.4s ease-in-out infinite}
@keyframes nowPulse{0%,100%{r:5}50%{r:6.5}}
.curveAxis{display:flex;justify-content:space-between;margin-top:.5rem}
.curveAxis span{font-family:var(--mono);font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
```

A drink has a NEGATIVE amp (it dents the curve). Caffeine after ~2pm bleeds into sleep: flag it amber in the coach, do not block the log. Half-life of caffeine is ~5h, so a 2pm coffee is still ~25% in your system at midnight.

## 2. Timeline rows: the day schedule

The schedule reads as a clean ROW list (not a time grid): a colored tab, a mono time range, a serif name, a "now" pill on the row that is currently running. One tap edits. This is the "timeline" of your day.

```html
<div class="sched">
  <div class="schedRow schedNow" style="--bc:#6EE7B7">
    <span class="schedBar"></span>
    <span class="schedTime">9<span class="schedDash">&#8211;</span>11 AM</span>
    <span class="schedName">Deep work</span>
    <span class="schedNowTag">now</span>
  </div>
  <div class="schedRow" style="--bc:#5E9BFF">
    <span class="schedBar"></span>
    <span class="schedTime">1<span class="schedDash">&#8211;</span>2 PM</span>
    <span class="schedName">Gym</span>
  </div>
  <div class="schedRow" style="--bc:#F59E0B">
    <span class="schedBar"></span>
    <span class="schedTime">4<span class="schedDash">&#8211;</span>5 PM</span>
    <span class="schedName">Email <i class="schedRep" title="repeats daily">&#8635;</i></span>
  </div>
</div>
```

```css
.sched{display:flex;flex-direction:column;gap:6px}
.schedRow{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;
  padding:12px 14px;border-radius:11px;font-family:var(--serif);
  background:var(--card);border:1px solid var(--border);
  transition:border-color .14s,background .14s,transform .14s}
.schedRow:hover{border-color:var(--bc);
  background:rgba(255,255,255,.05);transform:translateX(2px)}
.schedNow{border-color:var(--bc);
  background:rgba(255,255,255,.07)}
.schedBar{width:4px;align-self:stretch;min-height:22px;border-radius:3px;background:var(--bc);flex:0 0 auto}
.schedTime{flex:0 0 auto;width:116px;font-family:var(--mono);font-size:13px;color:var(--muted-strong);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.schedDash{margin:0 3px;color:var(--bc)}
.schedName{flex:1;min-width:0;font-size:17px;color:var(--fg);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:7px}
.schedRep{font-style:normal;font-size:12px;color:var(--bc)}
.schedNowTag{flex:0 0 auto;font-family:var(--mono);font-size:9px;letter-spacing:1.5px;
  text-transform:uppercase;color:#06140b;background:var(--bc);padding:3px 8px;border-radius:999px}
```

Difficulty maps to a tab color: hard = mint, normal = azure, easy = amber. Auto-placement is the magic: an untimed "hard" task drops onto the highest part of the curve, "easy" onto the lowest. Color the tab by difficulty and let the slot fall out of the curve.

A natural-language quick-add console sits above the list (a `&#8250;` prompt, an input, an enter button):

```html
<div class="qadd">
  <span class="qChev">&#8250;</span>
  <input class="qInput" placeholder="e.g. deep work 9-11 hard, gym 1930, read 30m"/>
  <button class="qBtn"><span class="qRet">&#9166;</span>ADD</button>
</div>
```

```css
.qadd{display:flex;align-items:center;gap:9px;padding:11px 13px;border:1px solid var(--border);
  border-radius:11px;background:rgba(255,255,255,.015)}
.qChev{color:var(--mint);font-size:18px;font-weight:600;line-height:1}
.qInput{flex:1;background:none;border:none;outline:none;color:var(--fg);
  font-family:var(--mono);font-size:13px}
.qInput::placeholder{color:var(--muted)}
.qBtn{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;
  letter-spacing:.1em;padding:7px 12px;border-radius:8px;border:1px solid var(--border);
  background:none;color:var(--muted-strong);cursor:pointer;transition:.14s}
.qBtn:hover{background:rgba(110,231,183,.12);color:var(--mint)}
.qRet{font-size:13px;opacity:.85}
```

## 3. Best-hours windows (the "schedule it here" callouts)

Walk the curve, collect every contiguous run >=70, report each window with its peak hour, score, and tier. These are the rows you tell people to block their hard work into.

```js
function bestWindows(curve, threshold){
  threshold=threshold||70; var out=[], start=null;
  for(var i=0;i<curve.length;i++){
    if(curve[i]>=threshold){ if(start==null) start=i; }
    else if(start!=null){ if(i-start>=1) out.push([start,i]); start=null; }
  }
  if(start!=null && curve.length-1-start>=1) out.push([start,curve.length-1]);
  return out.map(function(r){
    var pk=r[0], pv=0, sum=0, n=0;
    for(var h=r[0];h<=r[1];h++){ sum+=curve[h]; n++; if(curve[h]>pv){pv=curve[h];pk=h;} }
    return {start:r[0], end:r[1], peakHour:pk, peakScore:Math.round(pv), avg:sum/n};
  }).sort(function(a,b){return b.peakScore-a.peakScore;});
}
```

```html
<div class="winRow">
  <div class="winTime"><span class="winSpan">9a&#8211;1p</span><span class="winSub">Peaks 11 AM</span></div>
  <div class="winMeta"><span class="winTier">Peak</span><span class="winScore">92</span></div>
  <button class="winBlock">Block &#8594;</button>
</div>
```

```css
.winRow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:13px;
  border:1px solid var(--border);background:var(--card)}
.winTime{display:flex;flex-direction:column;flex:1}
.winSpan{font-family:var(--serif);font-style:italic;font-size:26px;color:var(--mint);line-height:1}
.winSub{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.winMeta{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.winTier{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mint)}
.winScore{font-family:var(--serif);font-style:italic;font-size:20px;color:var(--fg)}
.winBlock{font-family:var(--mono);font-size:11px;letter-spacing:.06em;padding:7px 12px;border-radius:8px;
  border:1px solid var(--border);background:none;color:var(--muted-strong);cursor:pointer;transition:.14s}
.winBlock:hover{border-color:var(--mint);color:var(--mint)}
```

For a tired window use amber on `winSpan`, `winSub`, `winTier`. An empty state ("No peak windows today. Recovery is capping your ceiling. Rest, hydrate, aim for tomorrow.") is warm, never a fail.

## 4. The substance / stimulant log

Quick-log chips on top (one tap = logged at default dose, now), today's stack below (newest first, tap the times-glyph to undo). Icons are inline SVG, never emoji.

```html
<section class="stack">
  <div class="stackEyebrow">Today's stack</div>
  <div class="quickRow">
    <button class="quickChip">
      <span class="qIcon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/></svg></span>
      <span class="qLbl">Coffee</span><span class="qDose">95 mg</span>
    </button>
    <button class="quickChip">
      <span class="qIcon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 4.5 6.5 4.5 9a4.5 4.5 0 0 1-9 0c0-2.5 1.5-5 4.5-9Z"/></svg></span>
      <span class="qLbl">Water</span><span class="qDose">8 oz</span>
    </button>
  </div>
  <ul class="stackList">
    <li class="stackItem">
      <span class="qIcon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/></svg></span>
      <div class="stackMain"><div class="stackName">Coffee</div><div class="stackMeta">95 mg &middot; 8:14a</div></div>
      <button class="stackX" aria-label="Remove Coffee">&times;</button>
    </li>
  </ul>
</section>
```

```css
.stackEyebrow{font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.quickRow{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.quickChip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;
  border:1px solid var(--border);background:rgba(255,255,255,.03);cursor:pointer;color:var(--fg);
  transition:border-color .16s,transform .16s}
.quickChip:hover{border-color:var(--mint);transform:translateY(-1px)}
.qIcon{color:var(--mint);display:inline-flex}
.qLbl{font-size:13px}
.qDose{font-family:var(--mono);font-size:11px;color:var(--muted)}
.stackList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.stackItem{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;
  border:1px solid var(--border);background:var(--card)}
.stackMain{flex:1;min-width:0}
.stackName{font-size:14px;color:var(--fg)}
.stackMeta{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:1px}
.stackX{background:none;border:none;color:var(--muted);font-size:18px;line-height:1;cursor:pointer;padding:2px 6px}
.stackX:hover{color:var(--amber)}
```

Each substance carries its pharmacokinetics so it can feed the curve in section 1: `{amp, onset, peak, half, defaultDose}`. Sample library (amp = focus points at peak, standard dose):
coffee `amp 16, onset .25, peak .75, half 5` &middot; espresso `14/.2/.5/5` &middot; energy drink `22/.2/.5/5` &middot; matcha `12/.5/1.5/5` &middot; workout `22/0/.5/1.5` &middot; water `6/.1/.5/1.5` &middot; L-theanine `6/.5/1/3` &middot; melatonin `-8/.5/1/1` &middot; alcohol `-10/.2/.75/1`.

## 5. The energy dial (mood quick-tap)

Five tone-colored chips, one tap logs how you feel, the tapped chip flashes mint for 400ms, and a recent pill shows your last reading. Full words, never single letters (zero ambiguity at a glance).

```html
<div class="dial">
  <div class="dialHead"><div class="dialTitle">How are you feeling?</div>
    <div class="dialHint">Optional, helps find your best times</div></div>
  <div class="dialRow">
    <button class="dialChip" data-tone="low"><span class="dialDot"></span>Foggy</button>
    <button class="dialChip" data-tone="watch"><span class="dialDot"></span>Tired</button>
    <button class="dialChip" data-tone="mid"><span class="dialDot"></span>Steady</button>
    <button class="dialChip" data-tone="good"><span class="dialDot"></span>Sharp</button>
    <button class="dialChip" data-tone="peak"><span class="dialDot"></span>Peak</button>
    <span class="dialRecent" data-tone="good">Sharp &middot; 9:52 PM</span>
  </div>
</div>
<script>
 document.querySelectorAll('.dialChip').forEach(function(b){
   b.addEventListener('click',function(){
     b.classList.add('flash'); setTimeout(function(){b.classList.remove('flash');},400);
     var r=document.querySelector('.dialRecent');
     var t=new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
     r.textContent=b.textContent.trim()+' · '+t;
     r.setAttribute('data-tone', b.getAttribute('data-tone'));
   });
 });
</script>
```

```css
.dialHead{margin-bottom:10px}
.dialTitle{font-size:14px;color:var(--fg)}
.dialHint{font-size:11px;color:var(--muted);margin-top:2px}
.dialRow{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dialChip{appearance:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
  border-radius:999px;background:rgba(255,255,255,.03);border:1px solid var(--border);cursor:pointer;
  font-size:12px;font-weight:500;color:var(--fg);transition:border-color .16s,transform .16s,background .16s}
.dialChip:hover{transform:translateY(-1px);border-color:var(--border-strong)}
.dialDot{width:8px;height:8px;border-radius:50%;background:currentColor}
.dialChip[data-tone="low"]{color:var(--amber)} /* Foggy: amber, not red */
.dialChip[data-tone="watch"]{color:var(--amber)}
.dialChip[data-tone="mid"]{color:var(--muted-strong)}
.dialChip[data-tone="good"],.dialChip[data-tone="peak"]{color:var(--mint)}
.dialChip[data-tone="good"]:hover,.dialChip[data-tone="peak"]:hover{border-color:var(--mint);box-shadow:0 0 12px -4px var(--mint-glow)}
.dialChip.flash{background:rgba(110,231,183,.18);border-color:var(--mint)}
.dialRecent{margin-left:6px;font-family:var(--mono);font-size:11px;color:var(--mint)}
.dialRecent[data-tone="watch"]{color:var(--amber)}
.dialRecent[data-tone="mid"]{color:var(--muted-strong)}
```

The dot inherits `currentColor`, so one `data-tone` colors the whole chip. The original maps Foggy to red; under the color law, drop it to amber so a low-energy moment never reads as a failure.

## 6. The coach strip

Top 3 data-driven tips as a row of pills: a mint mark, a bold headline, one plain sentence. The rules are deterministic reads of the curve + logs.

```html
<section class="coach">
  <div class="coachEyebrow">How to improve today</div>
  <div class="coachList">
    <div class="coachItem"><span class="coachMark">&#10022;</span>
      <div class="coachText"><strong>Push hard.</strong> Best hour is 11 AM. Block it for what matters most.</div></div>
    <div class="coachItem"><span class="coachMark">&#10022;</span>
      <div class="coachText"><strong>Caffeine in the last 8h.</strong> Stop now for clean sleep. After 3pm it bleeds into slow-wave sleep.</div></div>
    <div class="coachItem"><span class="coachMark">&#10022;</span>
      <div class="coachText"><strong>No hydration logged.</strong> A glass of water nudges focus, the cheapest move in your stack.</div></div>
  </div>
</section>
```

```css
.coachEyebrow{font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.coachList{display:flex;flex-wrap:wrap;gap:10px}
.coachItem{display:flex;gap:9px;align-items:flex-start;flex:1 1 220px;padding:12px 14px;
  border-radius:12px;border:1px solid var(--border);background:var(--card)}
.coachMark{color:var(--mint);font-size:13px;line-height:1.4;flex:0 0 auto}
.coachText{font-size:13px;line-height:1.5;color:var(--muted-strong)}
.coachText strong{color:var(--fg);font-weight:600}
```

Rule shapes (plain reads, top 3 by upside): recovery >=80 -> "Green light to push"; recovery <50 -> "Cut caffeine ~30%, skip a second hard session"; caffeine logged <8h ago after 3pm -> amber sleep warning; no caffeine before 11am -> "a coffee now lifts your morning ~12 points"; no workout in a peak window -> "a session pegs your peak ~90 min later". Tier headline maps off the day score: Peak/Solid/Tired/Low/Drained.

## 7. The orbit gem motif

The real Peak gem is a tumbling Three.js octahedron that fires a "surge" every ~20-30s. For a sealed tile, approximate it: a floating glyph badge with a pulsing halo, plus a one-shot surge ring you fire on a timer. Reads as the same charged-crystal language.

```html
<div class="orbit" id="orbit">
  <span class="orbitHalo"></span>
  <span class="orbitGem">
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#6EE7B7" stroke-width="1.6" stroke-linejoin="round">
      <path d="M12 2 4 9l8 13 8-13-8-7Z"/><path d="M4 9h16M12 2v20"/>
    </svg>
  </span>
</div>
<script>
 (function(){
   var host=document.getElementById('orbit');
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
   function surge(){
     var ring=document.createElement('span'); ring.className='surgeRing';
     ring.addEventListener('animationend',function(){ring.remove();}); host.appendChild(ring);
     for(var i=0;i<12;i++){
       var s=document.createElement('span'); s.className='spark';
       var a=Math.random()*Math.PI*2, d=34+Math.random()*46;
       s.style.setProperty('--dx',(Math.cos(a)*d).toFixed(1)+'px');
       s.style.setProperty('--dy',(Math.sin(a)*d-12).toFixed(1)+'px');
       s.style.animationDelay=(Math.random()*0.09).toFixed(2)+'s';
       s.addEventListener('animationend',function(){this.remove();}); host.appendChild(s);
     }
     setTimeout(surge, 22000 + Math.random()*12000);
   }
   setTimeout(surge, 4000);
 })();
</script>
```

```css
.orbit{position:relative;width:120px;height:120px;display:grid;place-items:center}
.orbitGem{position:relative;z-index:2;display:grid;place-items:center;
  animation:orbitFloat 9s ease-in-out infinite alternate}
.orbitHalo{position:absolute;inset:-14%;border-radius:50%;
  background:radial-gradient(circle,rgba(110,231,183,.32),transparent 65%);
  filter:blur(8px);z-index:1;animation:orbitHalo 4.4s ease-in-out infinite}
@keyframes orbitFloat{from{transform:translateY(0) rotate(-3deg)}to{transform:translateY(-5px) rotate(3deg)}}
@keyframes orbitHalo{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.95;transform:scale(1.08)}}
.surgeRing{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;
  border:1.5px solid var(--mint);border-radius:50%;pointer-events:none;z-index:3;
  box-shadow:0 0 14px var(--mint-glow);animation:surgeRing 1.15s var(--ease) forwards}
@keyframes surgeRing{from{transform:scale(.3);opacity:.75}to{transform:scale(2.5);opacity:0}}
.spark{position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;
  background:var(--mint);box-shadow:0 0 7px rgba(110,231,183,.9);pointer-events:none;z-index:3;
  animation:spark 1.05s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes spark{from{transform:translate(0,0) scale(1);opacity:1}
  to{transform:translate(var(--dx),var(--dy)) scale(.3);opacity:0}}
@media(prefers-reduced-motion:reduce){.orbitGem,.orbitHalo{animation:none}.surgeRing,.spark{display:none}}
```

Sparks set per-element `--dx/--dy` so each flies a random direction. The float + halo carry the gem when nothing is firing; the surge is the punctuation. Fire it on the user's "you logged something" moment too, not only the timer, to make logging feel charged.

## Stack order (numbered eyebrows, like the real page)

`&middot;01` Right now (score ring + recommendation) &middot; `&middot;02` Your day (the curve) &middot; `&middot;03` Your schedule (timeline rows + quick-add) &middot; `&middot;04` Peak windows &middot; `&middot;05` Log (substance chips + energy dial). A LIVE NASDAQ-style ticker of recovery/sleep/HRV/hydration signals can sit under the header (marquee that pauses on hover, a blinking mint dot for LIVE).
