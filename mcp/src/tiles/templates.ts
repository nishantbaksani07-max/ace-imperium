// The 6 themed, sealed-HTML tile templates (one per archetype, 7 kinds map onto them).
// Every template is assembled by ONE shared skeleton (frame): a standalone
// <!doctype html> document carrying the Vitality bridge (save/load + the
// load:result listener) and one Vitality.report(...) line, styled in the Vitality
// theme. No external libs, no emojis. The output's script closes with a literal
// </script> because this IS a standalone document (like public/beer-tracker-tile.html).
//
// The floor this renders is deliberately RICH (docs/tile-lux-spec.md): a header
// eyebrow, a serif hero number with a status pill, a primary action, and one real
// section (a 7-day chart, a trend line, or a habit grid) with honest empty states.
// "Apple-minimal luxury": calm, one accent (mint), one caution (amber, never red),
// generous negative space, one signature entrance. One skeleton means one place to
// audit the head/theme, the bridge, the reduced-motion + ::selection rules, and the
// buttery-60fps motion law (animate transform/opacity only, never layout props).
// Each renderer supplies only its own hero/action/section markup and body script.

import type { TileMeta } from './infer.js';

// Inferred fields (label, unit) and overrides (name, unit) carry free text, so they
// must be escaped per CONTEXT before they touch the sealed document, or a quote or a
// </script> in a goal silently corrupts the tile (and a crafted name is stored-XSS
// inside the iframe). htmlEscape for HTML text/attribute sinks; jsString for any
// value interpolated into the inline <script>.
function htmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A complete, quoted JS string literal for an inline-<script> sink. JSON.stringify
// handles quotes, backslashes, and control characters; escaping `<` to < is the
// one extra step that stops a `</script>` or `<!--` inside the value from terminating
// the inline element (the HTML tokenizer scans for `</script` regardless of JS string
// context, so quoting alone is not enough).
function jsString(s: string): string {
  return JSON.stringify(String(s)).replace(/</g, '\\u003C');
}

// The Vitality host bridge: save/load the tile's OWN data, report ONE life-stream to
// Vee, and receive the load:result reply. This is the only channel out of the sealed
// iframe. Honesty is built in:
//  - load() re-asks the host once at 3s and resolves null only at ~6s, so a dropped
//    reply can never leave the tile permanently blank (every template coerces null
//    to its honest empty state). The waiter STAYS registered after that fallback:
//    if the real reply lands late (a stalled main thread during dashboard boot)
//    carrying stored data, and the tile has not saved yet, the tile reloads to boot
//    from the real history instead of letting the next save overwrite it with the
//    empty state. A save marks Vitality._sv so a late reply never stomps new input.
//  - the host's save:error / report:error replies (a quota-full save, a report that
//    never landed in Vee) surface as a calm amber note via msg(..., true), instead of
//    the tile silently believing its own "logged" copy.
const BRIDGE = `var Vitality={_w:{},_sv:false,
  save:function(d){Vitality._sv=true;parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},
  load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);var ask=function(){parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')};var n=0;var t=setInterval(function(){n++;if(n===1){ask();return}clearInterval(t);if(Vitality._w[id]){Vitality._w[id]=function(d){if(d!=null&&!Vitality._sv)location.reload()};res(null)}},3000);Vitality._w[id]=function(d){clearInterval(t);res(d)};ask()})},
  report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}
};
window.addEventListener('message',function(e){var m=e.data;if(!m||m.source!=='vitality-host')return;
if(m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id];return}
if(m.type==='save:error'){msg('that save did not stick, tap it again in a moment',true);return}
if(m.type==='report:error'){msg('that log did not land, so it does not count yet. try it again in a moment',true)}});`;

// Shared runtime helpers. The day store is named _days (NOT history: `history` is the
// read-only window.history global, and `var history=[]` throws in a browser and breaks
// every tile at render). Date keys are built from LOCAL getters, never toISOString
// (which drifts a day across the UTC boundary). All small, all pure.
const CORE = `function pad(n){return (n<10?'0':'')+n}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function today(){return key(new Date())}
var _days=[];
function find(k){for(var i=0;i<_days.length;i++){if(_days[i].date===k)return _days[i]}return null}
function get(k){var r=find(k);if(r)return r;r={date:k,value:0};_days.push(r);return r}
function last7(){var out=[];for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var k=key(d);var r=find(k);out.push({date:k,value:r?r.value:null,dow:d.getDay()})}return out}
var DOW=['S','M','T','W','T','F','S'];
function fmt(n){n=Math.round(n);var s=String(Math.abs(n));var o='';for(var i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)o+=',';o+=s[i]}return (n<0?'-':'')+o}
function round1(n){return Math.round(n*10)/10}
function msg(t,warn){var m=document.getElementById('msg');if(!m)return;m.textContent=t||'';m.className='msg'+(warn?' warn':'')}
function pill(state,text){var p=document.getElementById('status');if(!p)return;p.className='pill '+state;p.innerHTML='<span class="dot"></span>'+text}
function streakGE(thresh){var d=new Date();var r=find(today());if(!(r&&(r.value||0)>=thresh))d.setDate(d.getDate()-1);var s=0;for(var g=0;g<400;g++){var x=find(key(d));if(x&&(x.value||0)>=thresh){s++;d.setDate(d.getDate()-1)}else break}return s}
function streak(){return streakGE(1)}
function pct(v,t){return t>0?Math.max(0,Math.min(1,v/t)):0}`;

// A 7-day mini bar chart into #section. Bars grow with transform:scaleY (buttery,
// compositor-only) rather than height (a layout prop the floor rejects). statFmt gets
// (total, avg, best, days) so each kind writes its own honest one-line stat.
const BARS = `function drawBars(statFmt){var wk=last7();var max=1;wk.forEach(function(r){if((r.value||0)>max)max=(r.value||0)});
var cells=wk.map(function(r,idx){var v=r.value||0;var ratio=max>0?v/max:0;var now=idx===6&&v>0;return '<div class="col"><div class="bwrap"><div class="bfill'+(now?' now':'')+'" style="transform:scaleY('+ratio.toFixed(3)+')"></div></div><span class="dlab">'+DOW[r.dow]+'</span></div>'}).join('');
var vals=wk.filter(function(r){return r.value!=null}).map(function(r){return r.value});
var total=vals.reduce(function(a,b){return a+b},0);var avg=vals.length?total/vals.length:0;var best=vals.length?Math.max.apply(null,vals):0;
var stat=vals.length?statFmt(total,avg,best,vals.length):'no days logged yet';
document.getElementById('section').innerHTML='<div class="bars">'+cells+'</div><div class="stat">'+stat+'</div>'}
// Target-aware 7-day chart: same bars, but the y-scale is anchored to the goal, a faint
// dashed target rule is drawn across the chart, and the stat counts days the goal was hit.
// Positioning is transform:translateY only (compositor-safe), never top/height.
function drawBarsTarget(target){var wk=last7();var max=target;wk.forEach(function(r){if((r.value||0)>max)max=(r.value||0)});
var cells=wk.map(function(r,idx){var v=r.value||0;var ratio=max>0?v/max:0;var now=idx===6&&v>0;var hit=v>=target;return '<div class="col"><div class="bwrap"><div class="bfill'+(now?' now':'')+(hit?' hit':'')+'" style="transform:scaleY('+ratio.toFixed(3)+')"></div></div><span class="dlab">'+DOW[r.dow]+'</span></div>'}).join('');
var trule=max>0?'<div class="tgt" style="transform:translateY('+(-(target/max)*100).toFixed(2)+'%)"></div>':'';
var vals=wk.filter(function(r){return r.value!=null}).map(function(r){return r.value});
var hitDays=wk.filter(function(r){return (r.value||0)>=target}).length;
var stat=vals.length?(hitDays+' of 7 days hit '+fmt(target)):'no days logged yet';
document.getElementById('section').innerHTML='<div class="bars">'+cells+trule+'</div><div class="stat">'+stat+'</div>'}`;

// The progress RING: an SVG arc hero for a goal-bearing tile (transform/opacity/
// stroke-dashoffset motion only). center = the big number, sub = the caption under it.
// No fake ring is ever drawn without a real target (the numeric kinds fall back to the
// bignum). Reduced-motion just lands the arc at its final offset (the CSS transition is
// disabled by the shared media query).
const RING = `function drawRing(frac,center,sub){var host=document.getElementById('hero');if(!host)return;var R=52,C=2*Math.PI*R,off=C*(1-Math.max(0,Math.min(1,frac)));
host.innerHTML='<svg class="ring" viewBox="0 0 128 128" aria-hidden="true"><circle class="ring-track" cx="64" cy="64" r="'+R+'"></circle><circle class="ring-arc" cx="64" cy="64" r="'+R+'" style="stroke-dasharray:'+C.toFixed(1)+';stroke-dashoffset:'+C.toFixed(1)+'"></circle></svg><div class="ring-center"><span class="ring-num" id="value">'+center+'</span><span class="ring-sub">'+sub+'</span></div>';
var arc=host.querySelector('.ring-arc');if(arc){requestAnimationFrame(function(){arc.style.strokeDashoffset=off.toFixed(1)})}}`;

// A deterministic, warm one-line INSIGHT in Vitality's voice. NOT an LLM: it selects a
// fixed sentence from a bank keyed by (kind, direction, today-vs-target, week trend,
// streak). Warm, never shaming, never red, no em dash, no emoji. Opts:
//   {kind,dir,today,target,trend(-1/0/1 over the week),streakN,unit,any(bool logged)}
const INSIGHT = `function insight(o){var s=o.streakN||0,tr=o.trend||0,t=o.target||0,v=o.today||0;
if(!o.any)return o.kind==='done'?'a fresh streak is one tap away.':'log your first and the story starts.';
if(o.kind==='done'){if(s>=7)return s+' days straight, this is who you are now.';if(s>=3)return s+' days in a row, keep it rolling.';if(s===1)return 'day one back on, nice.';return 'marked or not, showing up is the win.';}
if(t>0){if(v>=t){if(s>=3)return s+' days running at your goal, beautiful.';return 'goal met today, that is the one that counts.';}var left=t-v;if(v>=t*0.75)return 'so close, '+fmt(left)+' more to close it out.';if(v>0)return 'a good start, '+fmt(left)+' to go when you have a moment.';return 'an easy one to open before the day gets away.';}
if(o.kind==='measure'){if(tr>0)return o.dir==='down'?'ticking up a little, worth a gentle eye.':'trending up over the week, nice.';if(tr<0)return o.dir==='down'?'trending down, right where you want it.':'eased down this week, steady wins.';return 'holding steady, consistency is its own progress.';}
if(o.kind==='money'){if(o.dir==='up')return tr>0?'building nicely this week.':'every bit adds up, keep stacking.';return tr>0?'a little heavier this week, no drama.':'kept it tidy this week, well held.';}
if(tr>0)return 'trending up over the week, love to see it.';if(tr<0)return 'quieter week, tomorrow is a clean page.';return 'steady all week, that is the good kind of boring.';}`;

// The week trend sign for the numeric kinds: compare the first-half average to the
// second-half over the 7-day window. Returns -1, 0, or 1. Pure, small.
const TREND = `function weekTrend(){var wk=last7();var a=[],b=[];for(var i=0;i<wk.length;i++){var v=wk[i].value;if(v==null)continue;(i<3?a:b).push(v)}if(!a.length||!b.length)return 0;var am=a.reduce(function(x,y){return x+y},0)/a.length,bm=b.reduce(function(x,y){return x+y},0)/b.length;if(bm>am*1.05)return 1;if(bm<am*0.95)return -1;return 0}`;

// The shared head: fonts (Inter UI, Instrument Serif signature, JetBrains Mono labels),
// theme tokens, and the component styles every template inherits. Google Fonts over a
// <link> is the app's own method (next/font loads the same three families) and is the
// one external resource the seal allows. Motion is transform/opacity only; a mint
// ::selection and a prefers-reduced-motion escape hatch are mandatory floor rules.
const HEAD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--fg:#fff;--mint:#6EE7B7;--mint-hover:#5dd6a6;--mint-deep:#1f4d3d;--mint-glow:rgba(110,231,183,.4);--mint-ink:#042a1c;--amber:#F59E0B;--muted:rgba(255,255,255,.5);--muted-strong:rgba(255,255,255,.7);--border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.16);--card:rgba(255,255,255,.03);--radius-lg:12px;--radius-card:18px;--radius-xl:20px;--radius-pill:999px;--ease:cubic-bezier(.2,.8,.2,1);--ease-premium:cubic-bezier(.16,1,.3,1);--ease-soft:cubic-bezier(.32,.72,0,1);--spring:cubic-bezier(.34,1.56,.64,1);--dfast:120ms;--dur:180ms;--dlift:480ms;--font-inter:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--font-serif:'Instrument Serif','Times New Roman',Georgia,serif;--font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:var(--font-inter);color:var(--fg);background:transparent;line-height:1.5;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;accent-color:var(--mint);-webkit-user-select:none;user-select:none}
input{-webkit-user-select:text;user-select:text;caret-color:var(--mint)}
::selection{background:rgba(110,231,183,.25)}::-moz-selection{background:rgba(110,231,183,.25)}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input{font-family:inherit;color:inherit}
.shell{position:relative;min-height:100%;padding:clamp(16px,5vw,40px);z-index:0}
.shell::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(60% 38% at 50% -6%,rgba(110,231,183,.10),transparent 70%),radial-gradient(46% 30% at 100% 104%,rgba(31,77,61,.16),transparent 70%)}
.body{position:relative;z-index:2;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(16px,3.2vw,24px)}
.head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.eyebrow{display:flex;align-items:center;gap:10px;min-width:0}
.eyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:1.125rem;color:var(--mint);line-height:1}
.eyebrow .label{font-family:var(--font-mono);font-size:.68rem;text-transform:uppercase;letter-spacing:.22em;color:var(--muted-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero{position:relative;overflow:hidden;border:1px solid rgba(110,231,183,.18);border-radius:var(--radius-xl);background:radial-gradient(120% 80% at 0% 0%,rgba(110,231,183,.07),transparent 60%),var(--card);box-shadow:0 0 0 1px rgba(110,231,183,.05),0 0 56px -26px var(--mint-glow),inset 0 1px 0 rgba(255,255,255,.04);padding:clamp(18px,5vw,26px);display:flex;flex-direction:column;gap:14px}
.hero .title{font-family:var(--font-serif);font-style:italic;font-weight:400;font-size:clamp(1.9rem,6.5vw,2.6rem);line-height:1.02;letter-spacing:-.02em}
.heroRow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bignum{font-family:var(--font-serif);font-weight:400;font-size:clamp(3.4rem,13vw,5rem);line-height:.82;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.unit{font-family:var(--font-mono);font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--radius-pill);font-family:var(--font-mono);font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.14em;border:1px solid var(--border);white-space:nowrap}
.pill .dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}
.pill.good{color:var(--mint);border-color:rgba(110,231,183,.4);background:rgba(110,231,183,.05)}.pill.good .dot{background:var(--mint);animation:beat 2.6s var(--ease) infinite}
.pill.caution{color:var(--amber);border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.06)}.pill.caution .dot{background:var(--amber)}
.pill.idle{color:var(--muted);border-color:var(--border)}
.section{display:flex;flex-direction:column;gap:14px}
.secEyebrow{display:flex;align-items:center;gap:10px}
.secEyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:1.125rem;color:var(--mint);line-height:1}
.secEyebrow .label{font-family:var(--font-mono);font-size:.66rem;text-transform:uppercase;letter-spacing:.2em;color:var(--muted-strong)}
.secEyebrow .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border-strong),transparent)}
.card{position:relative;border:1px solid var(--border);border-radius:var(--radius-card);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));padding:18px;transition:border-color var(--dur) var(--ease-premium),background var(--dur) var(--ease-premium)}
.card::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 44px rgba(110,231,183,.07);opacity:0;pointer-events:none;transition:opacity var(--dur) var(--ease)}
.card:hover{border-color:rgba(110,231,183,.26)}.card:hover::after{opacity:1}
.actions{display:flex;flex-direction:column;align-items:center;gap:12px}
.steprow{display:flex;gap:16px;align-items:center;justify-content:center}
.step{width:58px;height:58px;border-radius:50%;border:1px solid var(--border-strong);background:var(--card);color:var(--fg);font-size:26px;display:grid;place-items:center;transition:transform var(--dfast) var(--ease-premium),background var(--dur) var(--ease),border-color var(--dur) var(--ease)}
.step:hover{border-color:var(--mint-glow)}.step:active{transform:scale(.9)}
.step.primary{background:var(--mint);border-color:var(--mint);color:var(--mint-ink);font-weight:700}.step.primary:hover{background:var(--mint-hover)}
.chiprow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:var(--radius-lg);font-size:.9rem;font-weight:600;line-height:1;transition:background var(--dur) var(--ease-premium),transform var(--dfast) var(--ease-premium),border-color var(--dur) var(--ease),color var(--dur) var(--ease)}
.btn-primary{background:var(--mint);color:var(--mint-ink)}.btn-primary:hover{background:var(--mint-hover)}.btn-primary:active{transform:translateY(1px)}
.btn-ghost{background:transparent;color:var(--fg);border:1px solid var(--border-strong)}.btn-ghost:hover{border-color:var(--mint);color:var(--mint)}.btn-ghost:active{transform:translateY(1px)}
.input{width:100%;background:var(--card);border:1px solid var(--border-strong);color:var(--fg);padding:13px 15px;border-radius:var(--radius-lg);font-size:1.05rem;outline:none;text-align:center;transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease)}
.input::placeholder{color:var(--muted)}
.input:focus{border-color:rgba(110,231,183,.45);background:rgba(110,231,183,.04)}
.inrow{display:flex;gap:10px;align-items:center;width:100%;max-width:360px;margin:0 auto}.inrow .input{flex:1}
.ratingrow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.rdot{min-width:48px;height:48px;padding:0 8px;border-radius:14px;border:1px solid var(--border-strong);background:var(--card);color:var(--fg);font-size:1rem;display:grid;place-items:center;transition:transform var(--dur) var(--spring),background var(--dur) var(--ease),border-color var(--dur) var(--ease)}
.rdot:active{transform:scale(.9)}
.rdot.on{background:var(--mint);border-color:var(--mint);color:var(--mint-ink);font-weight:700;transform:scale(1.06)}
.bigtoggle{width:100%;padding:18px;border-radius:var(--radius-card);border:1px solid var(--border-strong);background:var(--card);color:var(--fg);font-size:1.05rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px;transition:transform var(--dfast) var(--ease-premium),background var(--dur) var(--ease),border-color var(--dur) var(--ease)}
.bigtoggle:active{transform:scale(.98)}
.bigtoggle.on{background:var(--mint);border-color:var(--mint);color:var(--mint-ink)}
.bigtoggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.bars{display:flex;gap:8px;align-items:flex-end;height:98px}
.col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%}
.bwrap{width:100%;flex:1;display:flex;align-items:flex-end;background:rgba(255,255,255,.03);border-radius:6px;overflow:hidden}
.bfill{width:100%;height:100%;background:linear-gradient(180deg,rgba(110,231,183,.5),rgba(110,231,183,.12));border-radius:6px;transform-origin:bottom;transform:scaleY(0);transition:transform var(--dlift) var(--ease-premium)}
.bfill.now{background:linear-gradient(180deg,var(--mint),var(--mint-deep))}
.dlab{font-family:var(--font-mono);font-size:.58rem;letter-spacing:.08em;color:var(--muted)}
.stat{margin-top:14px;font-family:var(--font-mono);font-size:.64rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:center}
.grid{display:flex;gap:8px;justify-content:center}
.gday{flex:1;max-width:46px;aspect-ratio:1;border-radius:12px;border:1px solid var(--border);background:var(--card);display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px}
.gday.on{background:linear-gradient(180deg,var(--mint),var(--mint-deep));border-color:var(--mint)}
.gday.on .dlab{color:var(--mint-ink)}
.spark{width:100%;height:96px;display:block;overflow:visible}
.sline{fill:none;stroke:var(--mint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 6px rgba(110,231,183,.45));transition:stroke-dashoffset .95s var(--ease-soft)}
.sarea{opacity:.22}
.empty{text-align:center;color:var(--muted);padding:24px 14px}
.empty .lead{font-family:var(--font-serif);font-style:italic;font-size:1.2rem;color:var(--muted-strong);margin-bottom:4px}
.msg{min-height:15px;font-size:.72rem;color:var(--muted);text-align:center;font-family:var(--font-mono);letter-spacing:.06em}
.msg.warn{color:var(--amber)}
.ringwrap{position:relative;width:168px;height:168px;margin:2px auto 4px;display:grid;place-items:center}
.ring{width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.ring-track{fill:none;stroke:rgba(255,255,255,.06);stroke-width:9}
.ring-arc{fill:none;stroke:var(--mint);stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 8px rgba(110,231,183,.45));transition:stroke-dashoffset var(--dlift) var(--ease-soft)}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none}
.ring-num{font-family:var(--font-serif);font-weight:400;font-size:clamp(2.6rem,9vw,3.4rem);line-height:.9;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ring-sub{font-family:var(--font-mono);font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.tgt{position:absolute;left:0;right:0;bottom:0;height:0;border-top:1px dashed rgba(110,231,183,.45);pointer-events:none}
.bfill.hit{background:linear-gradient(180deg,var(--mint),var(--mint-deep))}
.insight{font-family:var(--font-serif);font-style:italic;font-size:1.02rem;line-height:1.35;color:var(--muted-strong);text-align:center;padding:2px 6px}
.streakrow{display:inline-flex;align-items:center;gap:7px;align-self:center;padding:5px 12px;border-radius:var(--radius-pill);border:1px solid rgba(110,231,183,.28);background:rgba(110,231,183,.05);font-family:var(--font-mono);font-size:.6rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--mint)}
.streakrow .dot{width:6px;height:6px;border-radius:50%;background:var(--mint)}
@keyframes rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
@keyframes beat{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.25)}}
.rise{opacity:0;animation:rise var(--dlift) var(--spring) both;animation-delay:calc(var(--i,0)*70ms)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rise{opacity:1;transform:none}.bfill{transform:none}.sline{transition:none}.ring-arc{transition:none}}
</style></head><body>`;

function dir(meta: TileMeta): string {
  return meta.goalDirection ? `,goalDirection:'${meta.goalDirection}'` : '';
}

// Every one of the six templates injects exactly this one contract-valid report()
// call inside its commit path, so a template-built tile ALWAYS feeds Vee its number
// by default (measurable kinds AND `done`, which reports value 0/1 on the marked day).
// This is the default that the envelope's kind-aware `report-missing` floor enforces:
// a measurable tile can never ship dark. Keep the four required fields (key,value,date,
// kind) present and the kind a taxonomy member, or lintTile's report-shape /
// report-kind-invalid errors reject the output.
function reportLine(meta: TileMeta, valueExpr: string): string {
  return `Vitality.report({key:${jsString(meta.key)},label:${jsString(meta.label)},value:${valueExpr},date:today(),kind:'${meta.kind}'${dir(meta)}});`;
}

interface Parts {
  eyebrow: string; // mono header label
  heroInner: string; // inside .hero
  action: string; // primary action block
  sectionLabel: string; // 02 section label
  section: string; // initial #section inner (rendered again by script)
  script: string; // body script (after BRIDGE + CORE)
  /** When true, render the warm INSIGHT line (a serif-italic <div id="insight">) under
   *  the section. The template's script fills it via the insight() bank. Off by default
   *  so a template that opts out renders exactly as before. */
  insight?: boolean;
}

/**
 * The one assembler every template runs through: shared head, then a header eyebrow,
 * a hero, the primary action, one real section, and an honest status line, then the
 * bridge + core helpers + the template's own script, closed as a standalone document.
 * Centralizing this is what makes the 6 templates a single audited skeleton.
 */
function frame(meta: TileMeta, p: Parts): string {
  const insightSlot = p.insight ? `\n<div class="insight rise" id="insight" style="--i:4"></div>` : '';
  return `${HEAD}<main class="shell"><div class="body">
<div class="head rise" style="--i:0"><div class="eyebrow"><span class="num">01</span><span class="label">${htmlEscape(p.eyebrow)}</span></div></div>
<section class="hero rise" style="--i:1"><div class="title">${htmlEscape(meta.label)}</div>${p.heroInner}</section>
<div class="actions rise" style="--i:2">${p.action}</div>
<section class="section rise" style="--i:3"><div class="secEyebrow"><span class="num">02</span><span class="label">${htmlEscape(p.sectionLabel)}</span><span class="rule"></span></div><div class="card"><div id="section">${p.section}</div></div></section>${insightSlot}
<div class="msg" id="msg" aria-live="polite"></div>
</div></main>
<script>${BRIDGE}
${CORE}
${p.script}
</script></body></html>`;
}

// Write the warm insight sentence (deterministic bank) into #insight, if present.
// A shared helper so every template's render() calls it the same way.
const SAYINSIGHT = `function sayInsight(o){var el=document.getElementById('insight');if(el)el.textContent=insight(o)}`;

// A hero with a big value + unit + a status pill. The DEFAULT (no goal) hero for the
// numeric kinds: an honest bignum, no fake progress ring.
function heroValue(unit: string, initValue = '0'): string {
  return `<div class="heroRow"><span class="bignum" id="value">${initValue}</span><span class="pill idle" id="status"><span class="dot"></span>nothing yet</span></div><span class="unit">${htmlEscape(unit)}</span>`;
}

// A hero for a GOAL-bearing tile: a progress-ring mount (#hero, filled by drawRing)
// plus a status pill row. The serif number rides inside the ring, so there is no
// separate .bignum here (richness accepts a ring OR a bignum hero).
function heroRingMount(): string {
  return `<div class="ringwrap"><div id="hero"><span class="ring-num" id="value">0</span></div></div><div class="heroRow" style="justify-content:center"><span class="pill idle" id="status"><span class="dot"></span>nothing yet</span></div>`;
}

// The ONE rich tally family: counter (count/intake) and timer (duration) share this.
// With a target it renders a ring hero, a target-aware 7-day chart, a streak chip, and
// the warm insight line; without a target it keeps the honest bignum + plain 7-day
// chart. opts carry the per-kind wiring (the action markup + the number-committing
// handler + the unit caption + the stat/insight labelling).
interface TallyOpts {
  eyebrow: string;
  sectionLabel: string;
  unitCaption: string; // caption under the bignum when there is no ring
  action: string; // the primary action markup
  wire: string; // JS that attaches handlers (each handler calls commit(...) after mutating get(today()))
  statFmt: string; // JS expression: a function(total,avg,best,days) for the no-target chart
  streakThreshExpr: string; // JS expression for the streak threshold (e.g. 'T||1')
  liveText: string; // JS expression -> the pill text when value>0 (has t.value in scope)
}

function tally(meta: TileMeta, o: TallyOpts): string {
  const hasTarget = typeof meta.target === 'number';
  const heroInner = hasTarget ? heroRingMount() : heroValue(o.unitCaption);
  const script = `${BARS}${RING}${TREND}${INSIGHT}${SAYINSIGHT}
var T=${meta.target ?? 0};var GD=${jsString(meta.goalDirection || '')};var U=${jsString(meta.unit)};
function disp(n){return n===Math.round(n)?fmt(n):String(round1(n))}
function paint(){var t=get(today());var v=t.value||0;var frac=pct(v,T);
${hasTarget
    ? `drawRing(frac,disp(v),'of '+disp(T)+' '+U);pill(v>=T?'good':'idle',v>=T?'goal met':(v>0?(${o.liveText}):'nothing yet'));`
    : `document.getElementById('value').textContent=disp(v);pill(v>0?(GD==='up'?'good':'idle'):'idle',v>0?(${o.liveText}):'nothing yet');`}
${hasTarget ? 'drawBarsTarget(T);' : `drawBars(${o.statFmt});`}
sayInsight({kind:${jsString(meta.kind)},dir:GD,today:v,target:T,trend:weekTrend(),streakN:streakGE(${o.streakThreshExpr}),unit:U,any:_days.length>0});}
function render(){paint()}
function commit(){var t=get(today());Vitality.save(_days);${reportLine(meta, 't.value')};render()}
${o.wire}
Vitality.load().then(function(d){_days=Array.isArray(d)?d:[];render()});`;
  return frame(meta, { eyebrow: o.eyebrow, heroInner, action: o.action, sectionLabel: hasTarget ? 'toward your goal' : 'this week', section: '', script, insight: true });
}

function counter(meta: TileMeta): string {
  const action = `<div class="steprow"><button class="step" id="minus" type="button" aria-label="one fewer">&minus;</button><button class="step primary" id="plus" type="button" aria-label="one more">+</button></div>`;
  const wire = `document.getElementById('plus').onclick=function(){get(today()).value=(get(today()).value||0)+1;commit();msg('logged today',false)};
document.getElementById('minus').onclick=function(){var t=get(today());if((t.value||0)>0){t.value--;commit()}};`;
  return tally(meta, {
    eyebrow: 'daily tally',
    sectionLabel: 'this week',
    unitCaption: meta.unit,
    action,
    wire,
    statFmt: `function(total,avg,best){return 'best '+best+', avg '+round1(avg)+' a day'}`,
    streakThreshExpr: 'T||1',
    liveText: `'logged today'`,
  });
}

function timer(meta: TileMeta): string {
  // Hours mode (sleep, naps, fasting) enters a decimal reading; minutes mode steps in
  // +5/+10/+15 chips. Both commit through the same tally paint/report path.
  const hours = /^h(rs?|ours?)?$/.test(meta.unit);
  const action = hours
    ? `<div class="inrow"><input class="input" id="in" type="number" inputmode="decimal" step="0.5" placeholder="hours today" /><button class="btn btn-primary" id="save" type="button">save</button></div><div class="chiprow"><button class="btn btn-ghost" id="clear" type="button">clear</button></div>`
    : `<div class="chiprow"><button class="btn btn-ghost" data-a="5" type="button">+5</button><button class="btn btn-ghost" data-a="10" type="button">+10</button><button class="btn btn-primary" data-a="15" type="button">+15</button></div><div class="chiprow"><button class="btn btn-ghost" id="clear" type="button">clear</button></div>`;
  const wire = hours
    ? `document.getElementById('save').onclick=function(){var n=parseFloat(document.getElementById('in').value);if(isNaN(n)){msg('enter hours first',true);return}get(today()).value=round1(n);document.getElementById('in').value='';commit();msg('saved',false)};
document.getElementById('clear').onclick=function(){get(today()).value=0;commit()};`
    : `Array.prototype.forEach.call(document.querySelectorAll('[data-a]'),function(b){b.onclick=function(){get(today()).value=(get(today()).value||0)+parseInt(b.getAttribute('data-a'),10);commit();msg('logged',false)}});
document.getElementById('clear').onclick=function(){get(today()).value=0;commit()};`;
  const statFmt = hours
    ? `function(total,avg,best,days){return 'this week '+round1(total)+' h, '+days+' of 7 days'}`
    : `function(total,avg,best,days){return 'this week '+total+' min, '+days+' of 7 days'}`;
  const liveText = hours ? `(t.value+' h in')` : `(t.value+' min in')`;
  return tally(meta, {
    eyebrow: 'time logged',
    sectionLabel: 'this week',
    unitCaption: hours ? 'hours today' : 'minutes today',
    action,
    wire,
    statFmt,
    streakThreshExpr: 'T||1',
    liveText,
  });
}

function scale(meta: TileMeta): string {
  const max = meta.scaleMax ?? 5;
  const heroInner = `<div class="heroRow"><span class="bignum" id="value">-</span><span class="pill idle" id="status"><span class="dot"></span>nothing yet</span></div><span class="unit">out of ${max}</span>`;
  const action = `<div class="ratingrow" id="scale"></div>`;
  const script = `${TREND}${INSIGHT}${SAYINSIGHT}var MAX=${max};
function drawWeek(){var wk=last7();var cells=wk.map(function(r,idx){var ratio=r.value!=null?r.value/MAX:0;var now=idx===6&&r.value!=null;return '<div class="col"><div class="bwrap"><div class="bfill'+(now?' now':'')+'" style="transform:scaleY('+ratio.toFixed(3)+')"></div></div><span class="dlab">'+DOW[r.dow]+'</span></div>'}).join('');var rated=wk.filter(function(r){return r.value!=null});document.getElementById('section').innerHTML='<div class="bars">'+cells+'</div><div class="stat">'+(rated.length?('rated '+rated.length+' of 7 days'):'no check-ins yet')+'</div>'}
function render(){var t=find(today());var s=document.getElementById('scale');s.innerHTML='';for(var i=1;i<=MAX;i++){(function(n){var b=document.createElement('button');b.type='button';b.className='rdot'+(t&&t.value===n?' on':'');b.textContent=n;b.onclick=function(){get(today()).value=n;commit()};s.appendChild(b)})(i)}if(t&&t.value){document.getElementById('value').textContent=t.value;pill('good','rated today')}else{document.getElementById('value').textContent='-';pill('idle','nothing yet')}drawWeek();sayInsight({kind:'rating',dir:'neutral',trend:weekTrend(),any:_days.length>0})}
function commit(){var t=get(today());Vitality.save(_days);${reportLine(meta, 't.value')};render();msg('saved',false)}
Vitality.load().then(function(d){_days=Array.isArray(d)?d:[];render()});`;
  return frame(meta, { eyebrow: 'daily check-in', heroInner, action, sectionLabel: 'last 7 days', section: '', script, insight: true });
}

function measure(meta: TileMeta): string {
  const heroInner = `<div class="heroRow"><span class="bignum" id="value">-</span><span class="pill idle" id="status"><span class="dot"></span>nothing yet</span></div><span class="unit">${htmlEscape(meta.unit)}</span>`;
  const action = `<div class="inrow"><input class="input" id="in" type="number" inputmode="decimal" step="0.1" placeholder="today's reading" /><button class="btn btn-primary" id="save" type="button">save</button></div>`;
  const script = `${INSIGHT}${SAYINSIGHT}var U=${jsString(meta.unit)};var GD=${jsString(meta.goalDirection || '')};
function drawSpark(){var pts=_days.slice().sort(function(a,b){return a.date<b.date?-1:1});var vals=pts.map(function(p){return p.value});if(vals.length<2){document.getElementById('section').innerHTML='<div class="empty"><div class="lead">your line starts here</div><div>log a couple more and the trend draws itself.</div></div>';return}var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);var pad=(mx-mn)*0.25||1;mn-=pad;mx+=pad;var W=300,H=88,st=W/(vals.length-1);var pth=vals.map(function(v,i){var x=i*st;var y=H-((v-mn)/(mx-mn))*H;return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' ');var html='<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6EE7B7" stop-opacity=".85"/><stop offset="1" stop-color="#6EE7B7" stop-opacity="0"/></linearGradient></defs><path class="sarea" fill="url(#sg)" d="'+pth+' L'+W+' '+H+' L0 '+H+' Z"/><path class="sline" vector-effect="non-scaling-stroke" d="'+pth+'"/></svg><div class="stat">latest '+vals[vals.length-1]+' '+U+', '+vals.length+' readings</div>';document.getElementById('section').innerHTML=html;var ln=document.querySelector('.sline');if(ln){try{var L=ln.getTotalLength();ln.style.strokeDasharray=L;ln.style.strokeDashoffset=L;requestAnimationFrame(function(){ln.style.strokeDashoffset=0})}catch(e){}}}
function render(){var pts=_days.slice().sort(function(a,b){return a.date<b.date?-1:1});var last=pts.length?pts[pts.length-1]:null;document.getElementById('value').textContent=last?last.value:'-';var tr=0;if(pts.length>=2){var prev=pts[pts.length-2];var dv=last.value-prev.value;tr=dv>0?1:(dv<0?-1:0);var amt=Math.abs(round1(dv));var toward=(GD==='down'&&dv<0)||(GD==='up'&&dv>0);if(dv===0){pill('idle','holding steady')}else{pill(toward?'good':'idle',(dv<0?'down ':'up ')+amt+' '+U)}}else if(last){pill('idle','first reading in')}else{pill('idle','nothing yet')}drawSpark();sayInsight({kind:'measure',dir:GD,trend:tr,any:pts.length>0})}
function commit(v){get(today()).value=v;Vitality.save(_days);var t=get(today());${reportLine(meta, 't.value')};render()}
document.getElementById('save').onclick=function(){var n=parseFloat(document.getElementById('in').value);if(isNaN(n)){msg('enter a number first',true);return}document.getElementById('in').value='';commit(n);msg('saved',false)};
Vitality.load().then(function(d){_days=Array.isArray(d)?d:[];render()});`;
  return frame(meta, { eyebrow: 'latest reading', heroInner, action, sectionLabel: 'trend', section: '', script, insight: true });
}

function money(meta: TileMeta): string {
  // Currency-aware: the symbol comes from the user's currency (infer sets it; '$' if
  // unset). It's printed as HTML in the hero and as a JS string constant in the script.
  const sym = meta.currencySymbol ?? '$';
  const heroInner = `<div class="heroRow"><span class="bignum" id="value">${htmlEscape(sym)}0</span><span class="pill idle" id="status"><span class="dot"></span>nothing yet</span></div><span class="unit">today</span>`;
  const action = `<div class="inrow"><input class="input" id="in" type="number" inputmode="decimal" step="0.01" placeholder="amount" /><button class="btn btn-primary" id="save" type="button">add</button></div>`;
  const script = `${BARS}${TREND}${INSIGHT}${SAYINSIGHT}
var CUR=${jsString(sym)};var GD=${jsString(meta.goalDirection || '')};
function render(){var t=get(today());document.getElementById('value').textContent=CUR+fmt(t.value||0);pill(t.value>0?'good':'idle',t.value>0?'logged today':'nothing yet');drawBars(function(total,avg){return 'this week '+CUR+fmt(total)+', avg '+CUR+fmt(avg)});sayInsight({kind:'money',dir:GD,trend:weekTrend(),any:_days.length>0})}
function commit(){var t=get(today());Vitality.save(_days);${reportLine(meta, 't.value')};render()}
document.getElementById('save').onclick=function(){var n=parseFloat(document.getElementById('in').value);if(isNaN(n)){msg('enter an amount first',true);return}get(today()).value=(get(today()).value||0)+n;document.getElementById('in').value='';commit();msg('added',false)};
Vitality.load().then(function(d){_days=Array.isArray(d)?d:[];render()});`;
  return frame(meta, { eyebrow: 'daily ledger', heroInner, action, sectionLabel: 'this week', section: '', script, insight: true });
}

function toggle(meta: TileMeta): string {
  const heroInner = `<div class="heroRow"><span class="bignum" id="value">0</span><span class="pill idle" id="status"><span class="dot"></span>not yet</span></div><span class="unit">day streak</span>`;
  const action = `<button class="bigtoggle" id="toggle" type="button">mark done</button>`;
  const script = `${INSIGHT}${SAYINSIGHT}var CHECK='<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
function drawGrid(){var wk=last7();var cells=wk.map(function(r){var on=r.value===1;return '<div class="gday'+(on?' on':'')+'"><span class="dlab">'+DOW[r.dow]+'</span></div>'}).join('');var mk=today().slice(0,7);var month=0;for(var j=0;j<_days.length;j++){if(_days[j].date.slice(0,7)===mk&&_days[j].value===1)month++}var st=streak();var stat=st>0?(st+' day streak, '+month+' this month'):(month>0?(month+' this month'):'no days marked yet');document.getElementById('section').innerHTML='<div class="grid">'+cells+'</div><div class="stat">'+stat+'</div>'}
function render(){var t=get(today());var on=t.value===1;var b=document.getElementById('toggle');b.className='bigtoggle'+(on?' on':'');b.innerHTML=(on?CHECK:'')+'<span>'+(on?'done today':'mark done')+'</span>';document.getElementById('value').textContent=streak();pill(on?'good':'idle',on?'done today':'not yet');drawGrid();sayInsight({kind:'done',streakN:streak(),any:_days.length>0})}
function commit(){var t=get(today());Vitality.save(_days);${reportLine(meta, 't.value')};render()}
document.getElementById('toggle').onclick=function(){var t=get(today());t.value=t.value?0:1;commit();msg(t.value?'nice, marked done':'unmarked',false)};
Vitality.load().then(function(d){_days=Array.isArray(d)?d:[];render()});`;
  return frame(meta, { eyebrow: 'daily habit', heroInner, action, sectionLabel: 'last 7 days', section: '', script, insight: true });
}

const RENDERERS: Record<TileMeta['template'], (m: TileMeta) => string> = {
  counter,
  timer,
  scale,
  measure,
  money,
  toggle,
};

export function renderTile(meta: TileMeta): string {
  return RENDERERS[meta.template](meta);
}
