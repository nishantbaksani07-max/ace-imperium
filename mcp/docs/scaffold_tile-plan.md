# scaffold_tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, deterministic `scaffold_tile` tool to the Vitality MCP that turns one plain-English goal into one finished, themed, bridge-wired Vitality tile (sealed HTML), matching the locked tile->Vee report contract.

**Architecture:** A pure generator (`scaffoldTile.ts`) infers `{key,label,kind,goalDirection,unit,template}` from the goal (overridable), picks one of 6 themed templates, and fills in the Vitality bridge plus one `Vitality.report(...)` line. The tool layer in `tools.ts` wires the pure function to an MCP tool that returns a header + the HTML as text. No DB, no `getVdb`, no LLM, no API key.

**Tech Stack:** TypeScript (ESM, NodeNext), `@modelcontextprotocol/sdk`, `zod`, Node's built-in test runner via `tsx` (already a devDep). No new dependencies.

## Global Constraints

- Work ONLY in `mcp/`. Do NOT touch `lib/tiles/*`, `app/app/*`, or the dashboard customizer (another window owns them).
- The tile->Vee report contract is LOCKED: source of truth `lib/tiles/reportContract.ts` on `origin/vee-tile-fuse`. We vendor a VERBATIM mirror into `mcp/`; never change its logic.
- Report stream shape: `{ key, label, value, date, kind, goalDirection? }`. `date` = local `YYYY-MM-DD`. `kind` in `intake | count | duration | rating | measure | money | done`. `goalDirection` in `up | down | neutral` (optional). Tile emits the NATURAL key (beer); the server normalizes (beer->alcohol). Do not normalize in the tile.
- Theme every tile: `body{background:transparent}`, color `#fff`, accent `#6EE7B7`, `accent-color:#6EE7B7`, Inter body + Instrument-Serif-italic title, rounded inputs/cards, spring `cubic-bezier(.16,1,.3,1)`, NO external libs, NO emojis.
- Bridge: `Vitality.save(data)` / `Vitality.load()` (host replies `{source:'vitality-host',type:'load:result',id,data}`) / `Vitality.report(stream)`, all via `postMessage(..., '*')`. Tiles run sealed (`sandbox="allow-scripts"`, opaque origin), so `'*'` is correct.
- Commit on branch `worktree-mcp-tile-builder`. Commit author email `founder@example.com` (three e's, no r). Do NOT push to prod. No em dashes anywhere.

**Run tests with:** `cd mcp && npm test` (added in Task 1).

---

### Task 1: Test harness + vendored contract mirror

**Files:**
- Modify: `mcp/package.json` (add `test` script)
- Create: `mcp/src/tiles/reportContract.ts` (verbatim mirror)
- Test: `mcp/src/tiles/reportContract.test.ts`

**Interfaces:**
- Produces: `REPORT_KINDS`, `GOAL_DIRECTIONS`, `ReportKind`, `GoalDirection`, `ReportedStream`, `normalizeKey(key)`, `validateReport(input): {ok:true,stream}|{ok:false,error}` — re-exported exactly as in the source.

- [ ] **Step 1: Add the test script to `mcp/package.json`**

In the `"scripts"` block, add:
```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

- [ ] **Step 2: Create the vendored contract mirror**

Run (from repo root) to produce the body, then prepend the mirror header:
```bash
cd mcp && mkdir -p src/tiles && git show origin/vee-tile-fuse:lib/tiles/reportContract.ts > src/tiles/reportContract.ts
```
Then prepend this header as the first lines of `mcp/src/tiles/reportContract.ts` (above the existing top comment):
```ts
// MIRROR of lib/tiles/reportContract.ts (source of truth on origin/vee-tile-fuse,
// owned by the dashboard window). Vendored because the mcp/ package cannot import
// across the package boundary. DO NOT EDIT the logic here — keep it byte-for-byte
// in sync with the source. scaffold_tile matches this contract; it does not redefine it.
```

- [ ] **Step 3: Write the harness/mirror test**

`mcp/src/tiles/reportContract.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, REPORT_KINDS, normalizeKey } from './reportContract.js';

test('mirror: a well-formed stream validates', () => {
  const r = validateReport({ key: 'beer', label: 'Beers', value: 2, date: '2026-06-28', kind: 'intake', goalDirection: 'down' });
  assert.equal(r.ok, true);
});

test('mirror: a bad kind is rejected', () => {
  const r = validateReport({ key: 'x', label: 'X', value: 1, date: '2026-06-28', kind: 'nope' });
  assert.equal(r.ok, false);
});

test('mirror: taxonomy + normalize intact', () => {
  assert.deepEqual([...REPORT_KINDS].sort(), ['count','done','duration','intake','measure','money','rating']);
  assert.equal(normalizeKey('Pints'), 'alcohol');
});
```

- [ ] **Step 4: Run and verify pass**

Run: `cd mcp && npm test`
Expected: 3 tests pass (proves the runner + tsx loader + mirror all work).

- [ ] **Step 5: Commit**
```bash
git add mcp/package.json mcp/src/tiles/reportContract.ts mcp/src/tiles/reportContract.test.ts
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "test(mcp): node:test harness + vendored report-contract mirror

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Inference module

**Files:**
- Create: `mcp/src/tiles/infer.ts`
- Test: `mcp/src/tiles/infer.test.ts`

**Interfaces:**
- Consumes: `ReportKind`, `GoalDirection` from `./reportContract.js`.
- Produces:
  - `type TemplateName = 'counter'|'timer'|'scale'|'measure'|'money'|'toggle'`
  - `interface TileMeta { key: string; label: string; kind: ReportKind; goalDirection?: GoalDirection; unit: string; template: TemplateName; scaleMax?: number }`
  - `interface InferInput { goal: string; kind?: ReportKind; name?: string; unit?: string; goalDirection?: GoalDirection }`
  - `function infer(input: InferInput): TileMeta`

- [ ] **Step 1: Write the failing tests**

`mcp/src/tiles/infer.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infer } from './infer.js';

const cases: Array<[string, Partial<{kind:string;key:string;goalDirection?:string;template:string}>]> = [
  ['beer tracker',                 { kind: 'intake', key: 'beer',       goalDirection: 'down', template: 'counter' }],
  ['track my water',               { kind: 'intake', key: 'water',      goalDirection: 'up',   template: 'counter' }],
  ['track my cold plunges',        { kind: 'count',  key: 'coldplunge', template: 'counter' }],
  ['meditation minutes',           { kind: 'duration', key: 'meditation', template: 'timer' }],
  ['rate my mood out of 10',       { kind: 'rating', key: 'mood',       template: 'scale' }],
  ['log my weight',                { kind: 'measure', key: 'weight',    template: 'measure' }],
  ['track my daily spend',         { kind: 'money',  key: 'spend',      goalDirection: 'down', template: 'money' }],
  ['did I read today',             { kind: 'done',   key: 'read',       template: 'toggle' }],
];

for (const [goal, exp] of cases) {
  test(`infer: "${goal}"`, () => {
    const m = infer({ goal });
    if (exp.kind) assert.equal(m.kind, exp.kind, 'kind');
    if (exp.key) assert.equal(m.key, exp.key, 'key');
    if (exp.template) assert.equal(m.template, exp.template, 'template');
    if (exp.goalDirection) assert.equal(m.goalDirection, exp.goalDirection, 'goalDirection');
  });
}

test('infer: explicit overrides win', () => {
  const m = infer({ goal: 'beer tracker', kind: 'count', name: 'Brews', goalDirection: 'up', unit: 'cans' });
  assert.equal(m.kind, 'count');
  assert.equal(m.template, 'counter');
  assert.equal(m.label, 'Brews');
  assert.equal(m.goalDirection, 'up');
  assert.equal(m.unit, 'cans');
});

test('infer: scale max follows /10', () => {
  assert.equal(infer({ goal: 'rate my mood out of 10' }).scaleMax, 10);
  assert.equal(infer({ goal: 'rate my mood' }).scaleMax, 5);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL ("Cannot find module './infer.js'").

- [ ] **Step 3: Implement `mcp/src/tiles/infer.ts`**

```ts
import type { ReportKind, GoalDirection } from './reportContract.js';

export type TemplateName = 'counter' | 'timer' | 'scale' | 'measure' | 'money' | 'toggle';

export interface TileMeta {
  key: string;
  label: string;
  kind: ReportKind;
  goalDirection?: GoalDirection;
  unit: string;
  template: TemplateName;
  scaleMax?: number;
}

export interface InferInput {
  goal: string;
  kind?: ReportKind;
  name?: string;
  unit?: string;
  goalDirection?: GoalDirection;
}

const KIND_TO_TEMPLATE: Record<ReportKind, TemplateName> = {
  intake: 'counter', count: 'counter', duration: 'timer',
  rating: 'scale', measure: 'measure', money: 'money', done: 'toggle',
};

// Checked in this order; `count` is the fallback. Word-ish matching on a lowercased goal.
const KIND_RULES: Array<[ReportKind, RegExp]> = [
  ['money',    /\$|money|spend|spent|budget|cost|saving|savings|dollars?|paid|income|earn|revenue/],
  ['duration', /minutes?|\bmins?\b|hours?|duration|meditat|reading|read\b|how long|session|screen time/],
  ['rating',   /\brate\b|rating|score|mood|energy|\/10|\/5|out of (ten|10|five|5)|quality|satisfaction/],
  ['measure',  /weight|\bkg\b|\blbs?\b|pounds?|\bcm\b|measure|body fat|blood pressure|distance|\bkm\b|miles?/],
  ['done',     /did i|yes\/?no|habit|complete|stick to|took my|no[- ]?fap|abstain|quit/],
  ['intake',   /beers?|alcohol|drinks?|water|glass(es)?|coffee|caffeine|calories?|cigarettes?|sugar|soda|supplements?|pills?/],
];

const DOWN = /alcohol|beers?|sugar|soda|cigarettes?|caffeine|spend|cost|screen time|\bcut\b|reduce|\bless\b|quit|no[- ]?fap/;
const UP = /water|workout|reps?|steps?|read|meditat|saving|savings|protein|streak|\bmore\b|increase/;

const STOP = /^(track|tracker|tracking|log|logging|logger|counter|count|my|a|an|the|daily|of|for|me|i)$/;

function words(goal: string): string[] {
  return goal.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function inferKind(goal: string): ReportKind {
  const g = goal.toLowerCase();
  for (const [kind, re] of KIND_RULES) if (re.test(g)) return kind;
  return 'count';
}

function deriveKey(goal: string, name?: string): string {
  const src = (name && name.trim()) ? name : goal;
  const salient = words(src).filter((w) => !STOP.test(w));
  const picked = (salient.length ? salient : words(src)).slice(0, 1);
  // singularize a trailing plural-ish "s" on the single chosen word for a stable key
  let key = picked.join('');
  key = key.replace(/(?:es|s)$/i, (m) => (key.length > 4 ? '' : m));
  return key || 'thing';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferLabel(goal: string, key: string, name?: string): string {
  if (name && name.trim()) return name.trim();
  const salient = words(goal).filter((w) => !STOP.test(w));
  const phrase = (salient.length ? salient : [key]).slice(0, 2).join(' ');
  return titleCase(phrase);
}

function inferGoalDirection(goal: string, kind: ReportKind): GoalDirection | undefined {
  const g = goal.toLowerCase();
  if (DOWN.test(g)) return 'down';
  if (UP.test(g)) return 'up';
  if (kind === 'rating' || kind === 'measure') return 'neutral';
  return undefined;
}

function inferUnit(goal: string, kind: ReportKind, key: string, unit?: string): string {
  if (unit && unit.trim()) return unit.trim();
  if (kind === 'duration') return 'min';
  if (kind === 'money') return '$';
  if (kind === 'rating') return 'rating';
  if (kind === 'done') return 'done';
  return key.endsWith('s') ? key : key + 's';
}

export function infer(input: InferInput): TileMeta {
  const kind = input.kind ?? inferKind(input.goal);
  const key = deriveKey(input.goal, input.name).toLowerCase();
  const label = inferLabel(input.goal, key, input.name);
  const goalDirection = input.goalDirection ?? inferGoalDirection(input.goal, kind);
  const unit = inferUnit(input.goal, kind, key, input.unit);
  const template = KIND_TO_TEMPLATE[kind];
  const scaleMax = kind === 'rating' ? (/\/10|out of (ten|10)/.test(input.goal.toLowerCase()) ? 10 : 5) : undefined;
  return { key, label, kind, ...(goalDirection ? { goalDirection } : {}), unit, template, ...(scaleMax ? { scaleMax } : {}) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && npm test`
Expected: all infer tests pass. If a case fails, adjust the regex/stopword for that case ONLY; do not loosen others.

- [ ] **Step 5: Commit**
```bash
git add mcp/src/tiles/infer.ts mcp/src/tiles/infer.test.ts
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "feat(mcp): scaffold_tile inference (kind/key/label/direction/unit, overridable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Templates (bridge + 6 archetypes)

**Files:**
- Create: `mcp/src/tiles/templates.ts`
- Test: covered by Task 4's generator tests (templates are exercised through `scaffoldTile`).

**Interfaces:**
- Consumes: `TileMeta`, `TemplateName` from `./infer.js`.
- Produces: `function renderTile(meta: TileMeta): string` — a full `<!doctype html>...</html>` string.

**Shared rules for every template (the contract + theme made concrete):**
- Head boilerplate: reset, `body{background:transparent;color:#fff;accent-color:#6EE7B7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif}`. Title uses `font-family:'Instrument Serif',Georgia,serif;font-style:italic`.
- The BRIDGE constant (below) is included verbatim in every tile's `<script>`.
- History model is uniform: `history = [{date, value}]`; `get(date)` finds-or-creates today's row; `commit()` renders, `Vitality.save(history)`, then reports.
- The report line is exactly: `Vitality.report({key:'<key>',label:'<label>',value:<v>,date:today(),kind:'<kind>'<,goalDirection:'<dir>'>});`
- The closing script tag is a literal `</script>` (the output is a standalone HTML document, like `public/beer-tracker-tile.html`; no escaping needed).

- [ ] **Step 1: Implement `mcp/src/tiles/templates.ts`**

```ts
import type { TileMeta } from './infer.js';

const BRIDGE = `var Vitality={_w:{},
  save:function(d){parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},
  load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);Vitality._w[id]=res;parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')})},
  report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}
};
window.addEventListener('message',function(e){var m=e.data;if(m&&m.source==='vitality-host'&&m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id]}});
function today(){var d=new Date();var m=String(d.getMonth()+1).padStart(2,'0');var day=String(d.getDate()).padStart(2,'0');return d.getFullYear()+'-'+m+'-'+day}
var history=[];
function get(date){for(var i=0;i<history.length;i++){if(history[i].date===date)return history[i]}var row={date:date,value:0};history.push(row);return row}`;

const HEAD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#fff;background:transparent;accent-color:#6EE7B7;padding:8px;text-align:center}
.title{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:24px;margin-bottom:2px}
.label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:14px}
.big{font-size:60px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#fff,#9ff0cf);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.unit{font-size:13px;color:rgba(255,255,255,.4);margin-top:6px}
.row{display:flex;gap:14px;justify-content:center;align-items:center;margin-top:18px}
button{font-family:inherit;cursor:pointer;transition:all .18s cubic-bezier(.16,1,.3,1)}
.step{width:52px;height:52px;border-radius:50%;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#fff;font-size:26px;display:grid;place-items:center}
.step:hover{border-color:rgba(110,231,183,.55);background:rgba(110,231,183,.08)}
.step:active{transform:scale(.92)}
.plus{background:#6EE7B7;border-color:#6EE7B7;color:#042a1c;font-weight:700}
.pill{border-radius:999px;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#fff;font-size:14px;padding:10px 16px}
.pill:hover{border-color:rgba(110,231,183,.55)}
.mint{background:#6EE7B7;border-color:#6EE7B7;color:#042a1c;font-weight:700}
input{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:12px 14px;color:#fff;font-size:18px;font-family:inherit;caret-color:#6EE7B7;outline:none;text-align:center;width:160px}
input:focus{border-color:rgba(110,231,183,.5)}
.week{display:flex;gap:5px;justify-content:center;margin-top:22px}
.bar{width:13px;height:34px;border-radius:4px;background:rgba(255,255,255,.05);display:flex;align-items:flex-end;overflow:hidden}
.fill{width:100%;background:#6EE7B7;border-radius:4px;transition:height .3s cubic-bezier(.16,1,.3,1)}
.day{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,.35)}
.scale{display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap}
.dot{width:42px;height:42px;border-radius:12px;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#fff;font-size:15px;display:grid;place-items:center}
.dot.on{background:#6EE7B7;border-color:#6EE7B7;color:#042a1c;font-weight:700}
.note{font-size:11px;color:rgba(255,255,255,.3);margin-top:16px}
.toggle{width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#fff;font-size:16px;margin-top:8px}
.toggle.on{background:#6EE7B7;border-color:#6EE7B7;color:#042a1c;font-weight:700}
</style></head><body>`;

function dir(meta: TileMeta): string {
  return meta.goalDirection ? `,goalDirection:'${meta.goalDirection}'` : '';
}
function reportLine(meta: TileMeta, valueExpr: string): string {
  return `Vitality.report({key:'${meta.key}',label:'${meta.label.replace(/'/g, "")}',value:${valueExpr},date:today(),kind:'${meta.kind}'${dir(meta)}});`;
}
function head(meta: TileMeta, sub: string): string {
  return `${HEAD}<div class="title">${meta.label}</div><div class="label">${sub}</div>`;
}
function weekScript(): string {
  return `function renderWeek(){var wk=document.getElementById('week');if(!wk)return;wk.innerHTML='';var max=1;history.forEach(function(r){if(r.value>max)max=r.value});for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var m=String(d.getMonth()+1).padStart(2,'0');var dd=String(d.getDate()).padStart(2,'0');var key=d.getFullYear()+'-'+m+'-'+dd;var row=null;for(var j=0;j<history.length;j++){if(history[j].date===key){row=history[j];break}}var val=row?row.value:0;var pct=Math.round((val/max)*100);var el=document.createElement('div');el.className='day';el.innerHTML='<div class="bar"><div class="fill" style="height:'+pct+'%"></div></div><span>'+['S','M','T','W','T','F','S'][d.getDay()]+'</span>';wk.appendChild(el)}}`;
}

function counter(meta: TileMeta): string {
  return `${head(meta, meta.kind === 'intake' ? 'today' : 'today')}
<div class="big" id="v">0</div><div class="unit" id="u">tap to log</div>
<div class="row"><button class="step" id="minus" aria-label="one fewer">&minus;</button><button class="step plus" id="plus" aria-label="one more">+</button></div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
function render(){var t=get(today());document.getElementById('v').textContent=t.value;document.getElementById('u').textContent=t.value===0?'tap to log a ${meta.unit.replace(/s$/,'')}':(t.value+' ${meta.unit}');renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
document.getElementById('plus').onclick=function(){get(today()).value++;commit()};
document.getElementById('minus').onclick=function(){var t=get(today());if(t.value>0)t.value--;commit()};
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

function timer(meta: TileMeta): string {
  return `${head(meta, 'minutes today')}
<div class="big" id="v">0</div><div class="unit">min today</div>
<div class="row"><button class="pill" data-a="5">+5</button><button class="pill" data-a="10">+10</button><button class="pill mint" data-a="15">+15</button></div>
<div class="row"><button class="pill" id="clear">clear</button></div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
function render(){document.getElementById('v').textContent=get(today()).value;renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
Array.prototype.forEach.call(document.querySelectorAll('[data-a]'),function(b){b.onclick=function(){get(today()).value+=parseInt(b.getAttribute('data-a'),10);commit()}});
document.getElementById('clear').onclick=function(){get(today()).value=0;commit()};
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

function scale(meta: TileMeta): string {
  const max = meta.scaleMax ?? 5;
  return `${head(meta, 'how is it today')}
<div class="scale" id="scale"></div><div class="unit" id="u">tap a number</div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
var MAX=${max};
function render(){var t=get(today());var s=document.getElementById('scale');s.innerHTML='';for(var i=1;i<=MAX;i++){(function(n){var b=document.createElement('button');b.className='dot'+(t.value===n?' on':'');b.textContent=n;b.onclick=function(){get(today()).value=n;commit()};s.appendChild(b)})(i)}document.getElementById('u').textContent=t.value?('rated '+t.value+'/'+MAX):'tap a number';renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

function measure(meta: TileMeta): string {
  return `${head(meta, "today's reading")}
<div><input id="in" type="number" inputmode="decimal" placeholder="0" /></div>
<div class="row"><button class="pill mint" id="save">save ${meta.unit}</button></div>
<div class="big" id="v" style="font-size:34px;margin-top:14px">--</div><div class="unit">${meta.unit}</div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
function render(){var t=get(today());document.getElementById('v').textContent=t.value?t.value:'--';renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
document.getElementById('save').onclick=function(){var n=parseFloat(document.getElementById('in').value);if(isNaN(n))return;get(today()).value=n;document.getElementById('in').value='';commit()};
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

function money(meta: TileMeta): string {
  return `${head(meta, "today's amount")}
<div><input id="in" type="number" inputmode="decimal" placeholder="0" /></div>
<div class="row"><button class="pill mint" id="save">set amount</button></div>
<div class="big" id="v" style="font-size:40px;margin-top:14px">$0</div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
function render(){var t=get(today());document.getElementById('v').textContent='$'+(t.value||0);renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
document.getElementById('save').onclick=function(){var n=parseFloat(document.getElementById('in').value);if(isNaN(n))return;get(today()).value=n;document.getElementById('in').value='';commit()};
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

function toggle(meta: TileMeta): string {
  return `${head(meta, 'today')}
<div class="row"><button class="toggle" id="t">not yet</button></div>
<div class="week" id="week"></div><div class="note">saved to your account</div>
<script>${BRIDGE}
${weekScript()}
function render(){var t=get(today());var b=document.getElementById('t');b.className='toggle'+(t.value?' on':'');b.textContent=t.value?'done':'not yet';renderWeek()}
function commit(){render();Vitality.save(history);var t=get(today());${reportLine(meta, 't.value')}}
document.getElementById('t').onclick=function(){var t=get(today());t.value=t.value?0:1;commit()};
Vitality.load().then(function(d){history=Array.isArray(d)?d:[];render()});
</script></body></html>`;
}

const RENDERERS: Record<TileMeta['template'], (m: TileMeta) => string> = {
  counter, timer, scale, measure, money, toggle,
};

export function renderTile(meta: TileMeta): string {
  return RENDERERS[meta.template](meta);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mcp && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add mcp/src/tiles/templates.ts
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "feat(mcp): 6 themed, bridge-wired tile templates (counter/timer/scale/measure/money/toggle)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The generator + the contract proof test

**Files:**
- Create: `mcp/src/scaffoldTile.ts`
- Test: `mcp/src/scaffoldTile.test.ts`

**Interfaces:**
- Consumes: `infer`, `TileMeta`, `InferInput` from `./tiles/infer.js`; `renderTile` from `./tiles/templates.js`; `validateReport` from `./tiles/reportContract.js`.
- Produces:
  - `interface ScaffoldInput extends InferInput {}`
  - `interface ScaffoldResult { html: string; meta: TileMeta; header: string; text: string }`
  - `function scaffoldTile(input: ScaffoldInput): ScaffoldResult`

- [ ] **Step 1: Write the failing test**

`mcp/src/scaffoldTile.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldTile } from './scaffoldTile.js';
import { validateReport, REPORT_KINDS } from './tiles/reportContract.js';

// One representative goal per kind, so every template is generated and proven.
const byKind: Record<string, string> = {
  intake: 'beer tracker', count: 'track my cold plunges', duration: 'meditation minutes',
  rating: 'rate my mood out of 10', measure: 'log my weight', money: 'track my daily spend',
  done: 'did I read today',
};

for (const kind of REPORT_KINDS) {
  test(`scaffold: ${kind} tile emits a contract-valid stream`, () => {
    const { html, meta } = scaffoldTile({ goal: byKind[kind], kind: kind as any });
    assert.equal(meta.kind, kind);
    // the embedded report payload, with a sample runtime value + a valid date, must validate
    const r = validateReport({ key: meta.key, label: meta.label, value: 3, date: '2026-06-28', kind: meta.kind, ...(meta.goalDirection ? { goalDirection: meta.goalDirection } : {}) });
    assert.equal(r.ok, true, r.ok ? '' : (r as any).error);
    // the HTML must actually wire that report with the right key + kind
    assert.match(html, new RegExp(`Vitality\\.report\\([^)]*key:'${meta.key}'`));
    assert.match(html, new RegExp(`kind:'${meta.kind}'`));
    // bridge present
    assert.match(html, /type:'save'/);
    assert.match(html, /type:'load'/);
    assert.match(html, /type:'report'/);
    assert.match(html, /load:result/);
    // a complete sealed document, themed, no emoji
    assert.ok(html.startsWith('<!doctype html>'));
    assert.match(html, /<\/html>$/);
    assert.match(html, /#6EE7B7/);
    assert.equal(/\p{Extended_Pictographic}/u.test(html), false, 'no emoji');
  });
}

test('scaffold: result carries a header naming the inferred fields', () => {
  const { header, text, html } = scaffoldTile({ goal: 'beer tracker' });
  assert.match(header, /kind: intake/);
  assert.match(header, /key: beer/);
  assert.ok(text.includes(html));
});

test('scaffold: overrides flow through to the tile', () => {
  const { html, meta } = scaffoldTile({ goal: 'beer tracker', kind: 'count', name: 'Brews', goalDirection: 'up' });
  assert.equal(meta.kind, 'count');
  assert.equal(meta.label, 'Brews');
  assert.match(html, /kind:'count'/);
  assert.match(html, /goalDirection:'up'/);
  assert.match(html, /Brews/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL ("Cannot find module './scaffoldTile.js'").

- [ ] **Step 3: Implement `mcp/src/scaffoldTile.ts`**

```ts
import { infer, type InferInput, type TileMeta } from './tiles/infer.js';
import { renderTile } from './tiles/templates.js';

export interface ScaffoldInput extends InferInput {}

export interface ScaffoldResult {
  html: string;
  meta: TileMeta;
  header: string;
  text: string;
}

function buildHeader(meta: TileMeta): string {
  const fields = [
    `key: ${meta.key}`,
    `label: ${meta.label}`,
    `kind: ${meta.kind}`,
    meta.goalDirection ? `goalDirection: ${meta.goalDirection}` : null,
    `template: ${meta.template}`,
  ].filter(Boolean).join(' | ');
  return [
    `Vitality tile ready: "${meta.label}"`,
    `  ${fields}`,
    `Paste the HTML below into /app/create (Run tile), or upload it to your dashboard.`,
    `It is just HTML. Edit it freely.`,
  ].join('\n');
}

export function scaffoldTile(input: ScaffoldInput): ScaffoldResult {
  const meta = infer(input);
  const html = renderTile(meta);
  const header = buildHeader(meta);
  return { html, meta, header, text: `${header}\n\n${html}` };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && npm test`
Expected: all 7 kind tests + header + override tests pass.

- [ ] **Step 5: Commit**
```bash
git add mcp/src/scaffoldTile.ts mcp/src/scaffoldTile.test.ts
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "feat(mcp): scaffoldTile generator + contract-proof tests (every kind emits a valid stream)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Register the `scaffold_tile` MCP tool

**Files:**
- Modify: `mcp/src/tools.ts` (add import + one `server.registerTool` block; pure, ignores `getVdb`)
- Test: `mcp/src/scaffold_tile.tool.test.ts`

**Interfaces:**
- Consumes: `scaffoldTile` from `./scaffoldTile.js`; existing `registerTools(server, getVdb)`.
- Produces: a registered MCP tool `scaffold_tile` whose handler returns `{ content: [{ type:'text', text }] }`.

- [ ] **Step 1: Write the failing integration test**

`mcp/src/scaffold_tile.tool.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerTools } from './tools.js';

// Minimal fake McpServer that captures registered tools and lets us invoke handlers.
function fakeServer() {
  const tools: Record<string, { def: any; handler: (args: any) => Promise<any> }> = {};
  const server: any = {
    registerTool(name: string, def: any, handler: (args: any) => Promise<any>) {
      tools[name] = { def, handler };
    },
  };
  return { server, tools };
}

test('scaffold_tile is registered and returns the tile as text', async () => {
  const { server, tools } = fakeServer();
  // getVdb must never be called by scaffold_tile; throw if it is.
  registerTools(server, async () => { throw new Error('getVdb must not be called'); });
  assert.ok(tools['scaffold_tile'], 'tool registered');
  const res = await tools['scaffold_tile'].handler({ goal: 'beer tracker' });
  const text = res.content[0].text as string;
  assert.match(text, /Vitality tile ready/);
  assert.match(text, /<!doctype html>/);
  assert.match(text, /Vitality\.report\(/);
  assert.notEqual(res.isError, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL ("tool registered" assertion, scaffold_tile not present).

- [ ] **Step 3: Add the registration to `mcp/src/tools.ts`**

Add the import near the other imports:
```ts
import { scaffoldTile } from './scaffoldTile.js';
```
Inside `registerTools`, after the existing tools (before the closing `}`), add:
```ts
  // ── scaffold_tile (PURE builder — no DB, no getVdb) ───────────────────────────
  server.registerTool(
    'scaffold_tile',
    {
      title: 'Build a Vitality tile',
      description:
        'Turn a plain-English goal ("beer tracker", "track my cold plunges") into ONE finished, on-brand Vitality tile: sealed self-contained HTML, themed, pre-wired to the Vitality bridge (save/load) and carrying one optional report() line so it can connect to the dashboard with zero setup. Deterministic (no LLM/keys). Returns a short header naming the inferred {key,label,kind,goalDirection,template} followed by the HTML; paste it into /app/create or upload it. The caller may freely edit the returned HTML.',
      inputSchema: {
        goal: z.string().min(1).max(300).describe('What the tile tracks, in plain words'),
        kind: z.enum(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']).optional().describe('Override the inferred tile type'),
        name: z.string().min(1).max(60).optional().describe('Override the tile title/label'),
        unit: z.string().min(1).max(24).optional().describe('Unit for the copy, e.g. "min", "kg", "glasses"'),
        goalDirection: z.enum(['up', 'down', 'neutral']).optional().describe('Override whether up, down, or neither is the goal'),
      },
    },
    async (args: { goal: string; kind?: any; name?: string; unit?: string; goalDirection?: any }): Promise<ToolResult> => {
      try {
        return text(scaffoldTile(args).text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Vitality error: ${msg}` }], isError: true };
      }
    },
  );
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `cd mcp && npm test && npm run typecheck`
Expected: the tool test passes; typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add mcp/src/tools.ts mcp/src/scaffold_tile.tool.test.ts
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "feat(mcp): register scaffold_tile tool (pure, transport-agnostic)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verify end-to-end + document

**Files:**
- Modify: `mcp/README.md` (document the tool; SKILL.md at repo root is out of this worktree's boundary, so note there that it needs an entry on merge)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `cd mcp && npm test && npm run typecheck && npm run build`
Expected: all tests pass, no type errors, `dist/` builds.

- [ ] **Step 2: Smoke the real output**

Run: `cd mcp && node --import tsx -e "import('./src/scaffoldTile.ts').then(m=>process.stdout.write(m.scaffoldTile({goal:'track my cold plunges'}).html))" > /tmp/tile.html`
Then open `/tmp/tile.html` in Chrome to eyeball the look (it will say "tap to log"; the bridge is inert outside Vitality, which is expected).

- [ ] **Step 3: Document in `mcp/README.md`**

Add a short "scaffold_tile" section: what it does, the input fields, that it is pure/deterministic, and a note: "On merge to the dashboard repo, add a SKILL.md entry (root SKILL.md is owned outside this worktree)."

- [ ] **Step 4: Commit**
```bash
git add mcp/README.md
git -c user.email=founder@example.com -c user.name="Alex Wise" commit -m "docs(mcp): document scaffold_tile in README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** tool signature (Task 5), inference incl. overrides (Task 2), 6 templates -> 7 kinds (Task 3), born-ready theme+bridge+report (Task 3), vendored contract mirror (Task 1), TDD against `validateReport` for every kind (Task 4), file layout (all tasks under mcp/), boundaries + no prod push (Global Constraints + commit steps), upload envelope (out of scope, defined in the spec for brick 3). Covered.

**Placeholder scan:** every code step contains real code; every run step has an expected result. No TBDs.

**Type consistency:** `TileMeta`/`TemplateName`/`InferInput` defined in Task 2 and consumed unchanged in Tasks 3-4; `ScaffoldResult` defined in Task 4 and consumed in Task 5; `validateReport`/`REPORT_KINDS` from Task 1's mirror used in Tasks 1 and 4. Consistent.

**Note on `</script>`:** the generated tile is a standalone HTML document (like `public/beer-tracker-tile.html`), so its script closes with a literal `</script>`. Escaping (`<\/script>`) is only needed when HTML is embedded inside a JS string (as in CreateTile's DEFAULT_TILE), which is not our case.
