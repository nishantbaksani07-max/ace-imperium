import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTile } from './lintTile.js';
import { richnessOf } from './richness.js';
import { validateReport } from './reportContract.js';

// A NEW worked example: the SLEEP-QUALITY tile. It fills a gap the shipped examples
// leave open. Mentor is a keyed-AI chat, recipe is intake, sleep is duration, and
// deep-work is a count, but NONE of them is a RATING. This is the subjective-dial
// archetype done Fuel-grade: a serif today-score hero number on a 1 to 10 dial, a
// status pill that reads honestly (idle before any check-in, good on a strong night,
// caution on a rough one), a real 7-day bar chart section, a soft-confirm undo so a
// mistap is never stuck, honest persistence through the host bridge, and exactly one
// rating stream reported.
//
// It is hand-authored to be the QUALITY REFERENCE, so it must clear every gate it
// preaches: lint at 0 errors AND 0 warnings, the richness gate as Fuel-grade rich,
// and a valid report() stream. If a future edit drifts it below any of those, one
// of the three tests below fails loudly.

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep quality</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --fg:#fff;--mint:#6EE7B7;--mint-hover:#5dd6a6;--mint-deep:#1f4d3d;--mint-glow:rgba(110,231,183,.4);--mint-ink:#042a1c;
  --amber:#F59E0B;--muted:rgba(255,255,255,.5);--muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.16);--card:rgba(255,255,255,.03);
  --radius-lg:12px;--radius-card:18px;--radius-xl:20px;--radius-pill:999px;
  --ease:cubic-bezier(.2,.8,.2,1);--ease-premium:cubic-bezier(.16,1,.3,1);--spring:cubic-bezier(.34,1.56,.64,1);
  --dfast:120ms;--dur:180ms;--dlift:480ms;
  --font-inter:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-serif:'Instrument Serif','Times New Roman',Georgia,serif;
  --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
html{overscroll-behavior-y:none}
body{font-family:var(--font-inter);color:var(--fg);background:transparent;font-size:1rem;line-height:1.5;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;accent-color:var(--mint);
  -webkit-user-select:none;user-select:none}
input,select{caret-color:var(--mint)}
.selectable,.selectable *,input{-webkit-user-select:text;user-select:text}
::selection{background:rgba(110,231,183,.25)}
::-moz-selection{background:rgba(110,231,183,.25)}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select{font-family:inherit;color:inherit}

.shell{position:relative;min-height:100%;padding:clamp(16px,5vw,40px);z-index:0}
.shell::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(60% 40% at 50% -5%,rgba(110,231,183,.10),transparent 70%),
             radial-gradient(50% 30% at 100% 100%,rgba(31,77,61,.18),transparent 70%)}
.body{position:relative;z-index:2;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(16px,3vw,24px)}

.head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.eyebrow{display:flex;align-items:center;gap:.75rem;min-width:0}
.eyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:1.125rem;color:var(--mint);line-height:1}
.eyebrow .label{font-family:var(--font-mono);font-size:.75rem;text-transform:uppercase;letter-spacing:.22em;color:var(--muted-strong)}
.gear{flex:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--border);background:var(--card);
  color:var(--muted-strong);display:grid;place-items:center;
  transition:color var(--dur) var(--ease),border-color var(--dur) var(--ease)}
.gear:hover{color:var(--mint);border-color:var(--mint-glow)}
.gear:active{transform:scale(.94)}
.gear svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

.hero{position:relative;overflow:hidden;border:1px solid rgba(110,231,183,.18);border-radius:var(--radius-xl);
  background:radial-gradient(120% 80% at 0% 0%,rgba(110,231,183,.07),transparent 60%),var(--card);
  box-shadow:0 0 0 1px rgba(110,231,183,.06),0 0 56px -26px var(--mint-glow),inset 0 1px 0 rgba(255,255,255,.04);
  padding:clamp(18px,5vw,26px);display:flex;flex-direction:column;gap:1rem}
.hero .title{font-family:var(--font-serif);font-style:italic;font-weight:400;font-size:clamp(2rem,7vw,2.75rem);line-height:1;letter-spacing:-.02em}
.heroRow{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
.bignum{font-family:var(--font-serif);font-weight:400;font-size:clamp(3.5rem,13vw,5.2rem);line-height:.82;letter-spacing:-.02em;font-variant-numeric:tabular-nums;transition:transform var(--dfast) var(--spring)}
.bignum.pop{transform:scale(1.06)}
.bignum .of{font-family:var(--font-mono);font-size:1rem;color:var(--muted);letter-spacing:.04em}
.unit{font-family:var(--font-mono);font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;border:1px solid var(--border)}
.pill .dot{width:6px;height:6px;border-radius:50%}
.pill.good{color:var(--mint);border-color:rgba(110,231,183,.4);background:rgba(110,231,183,.05)}
.pill.good .dot{background:var(--mint)}
.pill.caution{color:var(--amber);border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.06)}
.pill.caution .dot{background:var(--amber)}
.pill.idle{color:var(--muted);border-color:var(--border);background:transparent}
.pill.idle .dot{background:var(--muted)}

.dial{display:flex;flex-direction:column;gap:12px}
.dialRead{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.dialRead .big{font-family:var(--font-serif);font-size:1.6rem;line-height:1}
.dialRead .hint{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.dots{display:flex;align-items:center;gap:6px}
.tick{flex:1;height:34px;border-radius:9px;border:1px solid var(--border-strong);background:var(--card);
  font-family:var(--font-mono);font-size:.68rem;color:var(--muted-strong);display:grid;place-items:center;
  transition:border-color var(--dur) var(--ease-premium),color var(--dur) var(--ease),transform var(--dfast) var(--ease-premium)}
.tick:hover{border-color:var(--mint-glow);color:var(--fg)}
.tick:active{transform:scale(.92)}
.tick.on{border-color:var(--mint);color:var(--mint-ink);background:linear-gradient(180deg,var(--mint),var(--mint-deep));font-weight:700}
.tick.low.on{background:linear-gradient(180deg,rgba(245,158,11,.9),rgba(124,45,18,.7));border-color:var(--amber);color:#1a1006}
.actions{display:grid;grid-template-columns:56px 1fr;gap:12px}
.undo{border:1px solid var(--border-strong);background:var(--card);color:var(--fg);border-radius:14px;font-size:1.4rem;
  transition:border-color var(--dur) var(--ease-premium),transform var(--dfast) var(--ease-premium),opacity var(--dur) var(--ease)}
.undo:hover{border-color:var(--mint);color:var(--mint)}
.undo:active{transform:scale(.94)}
.undo:disabled{opacity:.3;cursor:not-allowed}
.undo svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:16px;border-radius:14px;
  font-size:1rem;font-weight:600;line-height:1;background:var(--mint);color:var(--mint-ink);
  transition:background var(--dur) var(--ease-premium),transform var(--dfast) var(--ease-premium),opacity var(--dur) var(--ease)}
.btn:hover{background:var(--mint-hover)}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.4;cursor:not-allowed}

.section{display:flex;flex-direction:column;gap:1rem}
.secEyebrow{display:flex;align-items:center;gap:.75rem}
.secEyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:1.125rem;color:var(--mint);line-height:1}
.secEyebrow .label{font-family:var(--font-mono);font-size:.75rem;text-transform:uppercase;letter-spacing:.22em;color:var(--muted-strong)}
.secEyebrow .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border-strong),transparent)}
.card{border:1px solid var(--border);border-radius:var(--radius-card);
  background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));padding:1.25rem;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 24px 48px -28px rgba(0,0,0,.8);
  transition:border-color var(--dur) var(--ease-premium)}
.card:hover{border-color:rgba(110,231,183,.28)}

.bars{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;height:96px}
.col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0}
.bwrap{width:100%;height:80px;display:flex;align-items:flex-end;justify-content:center}
.bfill{width:66%;border-radius:6px 6px 0 0;background:linear-gradient(180deg,rgba(110,231,183,.32),rgba(31,77,61,.28));
  transform-origin:bottom;transform:scaleY(.02);transition:transform var(--dlift) var(--ease-premium)}
.bfill.now{background:linear-gradient(180deg,var(--mint),var(--mint-deep));box-shadow:0 0 18px -4px var(--mint-glow)}
.bfill.low{background:linear-gradient(180deg,rgba(245,158,11,.55),rgba(124,45,18,.35))}
.dlab{font-family:var(--font-mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.stat{margin-top:14px;font-family:var(--font-mono);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-strong);text-align:center}
.empty{text-align:center;color:var(--muted);padding:2rem 1rem}
.empty .lead{font-family:var(--font-serif);font-style:italic;font-size:1.2rem;color:var(--muted-strong);margin-bottom:4px}

.settings{border:1px solid rgba(110,231,183,.26);border-radius:16px;background:rgba(110,231,183,.05);padding:16px;
  display:flex;flex-direction:column;gap:10px;text-align:left}
.settings h3{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);font-weight:700}
.settings p{font-size:.8rem;color:var(--muted-strong);line-height:1.55}
.settings label{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.settings input{width:100%;background:var(--card);border:1px solid var(--border-strong);color:var(--fg);
  padding:10px 12px;border-radius:var(--radius-lg);outline:none;transition:border-color var(--dur) var(--ease)}
.settings input:focus{border-color:rgba(110,231,183,.45);background:rgba(110,231,183,.04)}
.msg{min-height:16px;font-size:.75rem;color:var(--muted)}
.msg.warn{color:var(--amber)}

@keyframes rise{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.rise{opacity:0;animation:rise var(--dlift) var(--spring) both;animation-delay:calc(var(--i,0)*70ms)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}
  .rise{opacity:1;transform:none}.bfill{transform:none}.bignum.pop{transform:none}}
</style>
</head>
<body>
  <main class="shell">
    <div class="body">

      <div class="head rise" style="--i:0">
        <div class="eyebrow"><span class="num">01</span><span class="label">SLEEP QUALITY</span></div>
        <button class="gear" id="gear" type="button" aria-label="settings">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M20 12.5a7.9 7.9 0 0 0 .06-1l1.4-1.1-1.5-2.6-1.7.6a8 8 0 0 0-1.6-1l-.3-1.8h-3l-.3 1.8a8 8 0 0 0-1.6 1l-1.7-.6-1.5 2.6 1.4 1.1a7.9 7.9 0 0 0 0 2l-1.4 1.1 1.5 2.6 1.7-.6a8 8 0 0 0 1.6 1l.3 1.8h3l.3-1.8a8 8 0 0 0 1.6-1l1.7.6 1.5-2.6-1.4-1.1c.04-.33.06-.66.06-1z"/></svg>
        </button>
      </div>

      <section class="hero rise" style="--i:1">
        <h1 class="title">Sleep quality</h1>
        <div class="heroRow">
          <span class="bignum" id="value">0<span class="of">/10</span></span>
          <span class="pill idle" id="status"><span class="dot"></span>nothing yet</span>
        </div>
        <span class="unit">how last night felt</span>
      </section>

      <div class="settings rise" id="settings" style="--i:2" hidden>
        <h3>good-night line</h3>
        <p>The score at or above which a night reads as a good one. Anything under it stays a calm caution, never a scold, so a rough night is just noted.</p>
        <label for="goal">good at or above</label>
        <input id="goal" class="selectable" type="number" inputmode="numeric" step="1" min="1" max="10" placeholder="7">
      </div>

      <div class="dial rise" style="--i:2">
        <div class="dialRead">
          <span class="big" id="pendingRead">not rated</span>
          <span class="hint">tap a score</span>
        </div>
        <div class="dots" id="dots"></div>
      </div>

      <div class="actions rise" style="--i:2">
        <button class="undo" id="undo" type="button" aria-label="clear today's rating" disabled>
          <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/></svg>
        </button>
        <button class="btn" id="primary" type="button" disabled>Save last night</button>
      </div>

      <section class="section rise" style="--i:3">
        <div class="secEyebrow"><span class="num">02</span><span class="label">LAST 7 NIGHTS</span><span class="rule"></span></div>
        <div class="card" id="section"></div>
      </section>

      <div class="msg" id="msg" aria-live="polite"></div>

    </div>
  </main>
  <script>
  var Vitality={_w:{},
    save:function(d){parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},
    load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);Vitality._w[id]=res;parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')})},
    report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}
  };
  window.addEventListener('message',function(e){var m=e.data;if(m&&m.source==='vitality-host'&&m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id]}});
  (function(){
    var DOW=['Su','Mo','Tu','We','Th','Fr','Sa'];
    var MAXV=10;
    var GOAL=7, GD='up', loaded=false, pending=0;
    var mem={days:{},goal:7};

    function pad(n){return String(n).padStart(2,'0')}
    function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
    function today(){return key(new Date())}

    function writeStore(){Vitality.save(mem);}

    function get(k){return mem.days[k]||0}

    function last7(){
      var out=[],now=new Date();
      for(var i=6;i>=0;i--){var d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()-i,12));
        var lk=key(d);out.push({key:lk,dow:d.getUTCDay(),value:mem.days[lk]||0})}
      return out;
    }

    function statusPill(v){
      if(v<=0){pill('idle','nothing yet');return}
      if(v>=GOAL){pill('good',v+' of 10, rested');return}
      pill('caution','rough night');
    }
    function pill(state,text){var p=document.getElementById('status');if(!p)return;
      p.className='pill '+state;p.innerHTML='<span class="dot"></span>'+text}

    function buildDial(){
      var host=document.getElementById('dots');var html='';
      for(var n=1;n<=MAXV;n++){
        var low=n<GOAL;
        html+='<button class="tick'+(low?' low':'')+'" type="button" data-n="'+n+'" aria-label="score '+n+'">'+n+'</button>';
      }
      host.innerHTML=html;
      var ticks=host.querySelectorAll('.tick');
      for(var i=0;i<ticks.length;i++){
        ticks[i].addEventListener('click',function(){setPending(parseInt(this.getAttribute('data-n'),10))});
      }
    }
    function paintDial(){
      var ticks=document.getElementById('dots').querySelectorAll('.tick');
      for(var i=0;i<ticks.length;i++){
        var n=i+1;if(n<=pending)ticks[i].classList.add('on');else ticks[i].classList.remove('on');
      }
      var read=document.getElementById('pendingRead');
      read.textContent=pending>0?pending+' of 10':'not rated';
      document.getElementById('primary').disabled=!(loaded&&pending>0);
    }
    function setPending(n){pending=n;paintDial();}

    function drawBars(){
      var wk=last7();var logged=wk.filter(function(r){return r.value>0});
      if(!logged.length){
        document.getElementById('section').innerHTML='<div class="empty"><div class="lead">nothing yet</div><div>rate last night and your week starts here.</div></div>';
        return;
      }
      var cells=wk.map(function(r,idx){
        var ratio=r.value>0?Math.max(.08,r.value/MAXV):0;var now=idx===6&&r.value>0;
        var low=r.value>0&&r.value<GOAL;
        var cls='bfill'+(now?' now':'')+(low&&!now?' low':'');
        return '<div class="col"><div class="bwrap"><div class="'+cls+'" style="transform:scaleY('+ratio.toFixed(3)+')"></div></div><span class="dlab">'+DOW[r.dow]+'</span></div>';
      }).join('');
      var sum=0;logged.forEach(function(r){sum+=r.value});var avg=Math.round((sum/logged.length)*10)/10;
      var best=0;logged.forEach(function(r){if(r.value>best)best=r.value});
      var stat='avg '+avg+' of 10 over '+logged.length+' of 7 nights, best '+best;
      document.getElementById('section').innerHTML='<div class="bars">'+cells+'</div><div class="stat">'+stat+'</div>';
    }

    function popNum(){
      var el=document.getElementById('value');el.classList.add('pop');
      setTimeout(function(){el.classList.remove('pop')},160);
    }

    function render(){
      var v=get(today());
      document.getElementById('value').innerHTML=v+'<span class="of">/10</span>';
      statusPill(v);
      document.getElementById('undo').disabled=v<=0;
      paintDial();
      drawBars();
      report(v);
    }

    function report(v){
      if(v>0){Vitality.report({key:'sleep quality',label:'Sleep quality',value:v,date:today(),kind:'rating',goalDirection:'up'});}
    }

    function commit(){
      if(!loaded||pending<=0)return;
      mem.days[today()]=pending;writeStore();
      var m=document.getElementById('msg');m.className='msg';m.textContent='saved '+pending+' of 10 for last night.';
      popNum();render();
    }
    function clearToday(){
      if(get(today())<=0)return;
      delete mem.days[today()];pending=0;writeStore();
      var m=document.getElementById('msg');m.className='msg';m.textContent='cleared, rate it again when you like.';
      render();
    }

    function load(){
      Vitality.load().then(function(s){
        if(s&&typeof s==='object'){mem.days=s.days||{};if(typeof s.goal==='number')mem.goal=s.goal}
        GOAL=mem.goal||7;pending=get(today());
        document.getElementById('goal').value=mem.goal||'';
        buildDial();loaded=true;render();
      });
    }

    document.getElementById('primary').addEventListener('click',commit);
    document.getElementById('undo').addEventListener('click',clearToday);
    document.getElementById('gear').addEventListener('click',function(){var s=document.getElementById('settings');s.hidden=!s.hidden;if(!s.hidden)document.getElementById('goal').focus()});
    document.getElementById('goal').addEventListener('change',function(){
      var n=parseInt(this.value,10);if(!isFinite(n)){return}
      n=Math.max(1,Math.min(10,n));mem.goal=n;GOAL=n;writeStore();buildDial();render();
    });

    load();
  })();
  </script>
</body>
</html>`;

test('rating example: the tile is Vitality-grade (0 errors, 0 warnings)', () => {
  const result = lintTile(HTML);
  if (!result.ok || result.warnings > 0) {
    console.log('\n' + result.findings.map((f) => `  [${f.severity}] ${f.rule}: ${f.message}`).join('\n') + '\n');
  }
  assert.equal(result.errors, 0, 'the rating worked example must have zero floor errors');
  assert.equal(result.warnings, 0, 'the rating worked example must have zero polish warnings');
});

test('rating example: it clears the richness gate as Fuel-grade rich', () => {
  const r = richnessOf(HTML);
  if (!r.ok) console.log('\n  missing richness marks: ' + r.missing.join(', ') + '\n');
  assert.equal(r.ok, true, 'the rating worked example must be Fuel-grade rich');
  assert.equal(r.score, r.max, 'every richness mark must be present');
});

test('rating example: it reports exactly one valid rating stream', () => {
  // exactly one report() call, and it is a rating stream
  const reports = HTML.match(/Vitality\.report\s*\(/g) || [];
  assert.equal(reports.length, 1, 'a rating tile reports exactly one stream');
  assert.match(HTML, /kind:\s*'rating'/, 'reports a rating stream');
  assert.match(HTML, /goalDirection:\s*'up'/, 'a higher sleep-quality score is an up goal');
  // the exact shape it posts must pass the dashboard-side contract
  const v = validateReport({ key: 'sleep quality', label: 'Sleep quality', value: 8, date: '2026-07-02', kind: 'rating', goalDirection: 'up' });
  assert.equal(v.ok, true, 'the reported stream must validate against the contract');
});

// ── FILE C: BEHAVIOR of the reference tile (see exampleMoney.test.ts for the rationale) ──
import { mountReady as mountRating } from './behaviorHarness.js';

test('rating example behaves: renders and the hero shows the picked rating', async () => {
  const now = new Date('2026-07-03T10:00:00');
  const h = await mountRating(HTML, { now });
  assert.equal(h.errors.length, 0, `the rating reference threw at mount: ${h.errors.join(' | ')}`);
  assert.ok(h.section().length > 0, 'the last-7-days section rendered');
  // pick the 8th tick (an 8/10) then commit
  const ticks = h.win.document.querySelectorAll('#dots .tick');
  assert.ok(ticks.length >= 8, 'the /10 dial drew its ticks');
  ticks[7].click();
  await h.settle();
  await h.click('#primary');
  // the hero renders "8/10" (a value + a /10 suffix span), so assert on the leading number
  assert.match(h.valueText(), /^8\b/, 'the hero shows the committed 8/10 rating');
  assert.equal(h.errors.length, 0, 'no throw across the interaction');
  h.close();
});

test('rating example behaves: reports through the host bridge and survives reopen', async () => {
  const now = new Date('2026-07-03T10:00:00');
  const h = await mountRating(HTML, { now });
  const ticks = h.win.document.querySelectorAll('#dots .tick');
  ticks[7].click();
  await h.settle();
  await h.click('#primary');
  assert.ok(h.reports.length >= 1, 'the tile reports its rating to Vee via the host');
  const v = validateReport(h.reports[h.reports.length - 1]);
  assert.ok(v.ok && v.stream.value === 8, 'the reported value matches the on-screen rating');
  const h2 = await h.rehydrate();
  // the hero is a "8/10" reading (a value + a /10 suffix span), so assert on the leading
  // number, same as the sibling render test: value() would read the whole "8/10" as 810.
  assert.match(h2.valueText(), /^8\b/, 'reopening keeps the rating (host persistence)');
  h.close();
  h2.close();
});
