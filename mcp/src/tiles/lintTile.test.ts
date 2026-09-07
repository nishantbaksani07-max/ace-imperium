import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTile } from './lintTile.js';
import { scaffoldTile } from '../scaffoldTile.js';

// A clean, on-brand, sealed tile that should pass with ZERO errors and ZERO warnings.
const GOOD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#fff;background:transparent;padding:8px}
.title{font-family:'Instrument Serif',Georgia,serif;font-style:italic}
.big{color:#6EE7B7;transition:opacity .2s}
::selection{background:rgba(110,231,183,.25)}
@media (prefers-reduced-motion: reduce){*{transition:none !important;animation:none !important}}
</style></head><body>
<div class="title">Water</div><div class="big" id="v">0</div>
<button id="add">add</button>
<script>
var Vitality={save:function(d){parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}};
function today(){var d=new Date();var m=String(d.getMonth()+1).padStart(2,'0');var dd=String(d.getDate()).padStart(2,'0');return d.getFullYear()+'-'+m+'-'+dd}
var n=0;
document.getElementById('add').onclick=function(){n++;document.getElementById('v').textContent=n;Vitality.save({n:n});Vitality.report({key:'water',label:'Water',value:n,date:today(),kind:'count'})};
</script></body></html>`;

const ids = (html: string) => lintTile(html).findings.map((f) => f.rule);

test('a clean on-brand sealed tile passes with no errors and no warnings', () => {
  const r = lintTile(GOOD);
  assert.equal(r.ok, true, 'expected ok=true, findings: ' + JSON.stringify(r.findings));
  assert.equal(r.errors, 0);
  assert.equal(r.warnings, 0);
});

test('error: an external script src is rejected (sealed isolation)', () => {
  const bad = GOOD.replace('<script>\nvar Vitality', '<script src="https://cdn.example.com/x.js"></script>\n<script>\nvar Vitality');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('sealed-external-script'));
});

test('error: an external stylesheet link is rejected', () => {
  const bad = GOOD.replace('<style>', '<link rel="stylesheet" href="https://cdn.example.com/a.css"><style>');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('sealed-external-resource'));
});

test('error: a framework reference (React) is rejected', () => {
  const bad = GOOD.replace('var n=0;', 'ReactDOM.render(null,null);var n=0;');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('sealed-framework'));
});

test('error: toISOString().slice date is rejected (UTC drift)', () => {
  const bad = GOOD.replace(/function today\(\)\{[^}]*\}/, "function today(){return new Date().toISOString().slice(0,10)}");
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('date-utc-drift'));
});

test('error: a keyframe that animates a layout property (height) is rejected', () => {
  const bad = GOOD.replace('</style>', '@keyframes grow{from{height:0}to{height:40px}}</style>');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('motion-keyframe-layout'));
});

test('error: a keyframe animating filter:blur() is rejected (re-rasterizes every frame)', () => {
  const bad = GOOD.replace('</style>', '@keyframes glow{from{filter:blur(0)}to{filter:blur(8px)}}</style>');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('motion-keyframe-blur'));
});

test('error: a keyframe animating backdrop-filter is rejected (compositor-expensive)', () => {
  const bad = GOOD.replace('</style>', '@keyframes b{from{backdrop-filter:blur(0)}to{backdrop-filter:blur(6px)}}</style>');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('motion-keyframe-layout'));
});

test('warn: a transition on backdrop-filter is flagged', () => {
  const bad = GOOD.replace('transition:opacity .2s', 'transition:backdrop-filter .2s');
  assert.ok(ids(bad).includes('motion-transition-layout'));
});

test('over-fire guard: filter:brightness in a keyframe is allowed (cheap, used by the design system)', () => {
  const ok = GOOD.replace('</style>', '@keyframes pulse{from{filter:brightness(1)}to{filter:brightness(1.22)}}</style>');
  assert.equal(ids(ok).includes('motion-keyframe-blur'), false, 'brightness is not blur');
  assert.equal(ids(ok).includes('motion-keyframe-layout'), false, 'plain filter is not a layout prop');
  assert.equal(lintTile(ok).errors, 0);
});

test('warn: an emoji warns but does not block (taste is advice)', () => {
  const bad = GOOD.replace('Water', 'Water \u{1F4A7}');
  const r = lintTile(bad);
  assert.equal(r.ok, true);
  assert.ok(r.warnings > 0);
  assert.ok(ids(bad).includes('no-emoji'));
});

test('warn: an em dash warns but does not block (taste is advice)', () => {
  const bad = GOOD.replace('add', 'add — now');
  const r = lintTile(bad);
  assert.equal(r.ok, true);
  assert.ok(ids(bad).includes('no-em-dash'));
});

test('warn: a unicode checkmark warns but does not block (taste is advice)', () => {
  const withCheck = GOOD.replace('>add<', '>✓ add<');
  const r = lintTile(withCheck);
  assert.equal(r.ok, true);
  assert.ok(ids(withCheck).includes('no-unicode-check'));
});

test('error: a non-html fragment (no doctype/script/style) is rejected', () => {
  const r = lintTile('<div>just a fragment</div>');
  assert.equal(r.ok, false);
  assert.ok(r.findings.map((f) => f.rule).includes('doc-structure'));
});

test('warn: a transition on a layout property (width) is flagged', () => {
  const bad = GOOD.replace('transition:opacity .2s', 'transition:width .2s');
  assert.ok(ids(bad).includes('motion-transition-layout'));
});

test('warn: missing ::selection styling is flagged', () => {
  const bad = GOOD.replace('::selection{background:rgba(110,231,183,.25)}', '');
  assert.ok(ids(bad).includes('selection-style-missing'));
});

test('warn: animation present but no reduced-motion block is flagged', () => {
  const bad = GOOD.replace('@media (prefers-reduced-motion: reduce){*{transition:none !important;animation:none !important}}', '');
  assert.ok(ids(bad).includes('reduced-motion-missing'));
});

test('warn: more than one report() call is flagged', () => {
  const bad = GOOD.replace('Vitality.save({n:n});', "Vitality.save({n:n});Vitality.report({key:'x',label:'X',value:1,date:today(),kind:'count'});");
  assert.ok(ids(bad).includes('report-multiple'));
});

test('warn: localStorage without try/catch is flagged', () => {
  const bad = GOOD.replace('Vitality.save({n:n});', "localStorage.setItem('n',n);");
  assert.ok(ids(bad).includes('storage-unwrapped'));
});

test('warn: a non-transparent body background is flagged', () => {
  const bad = GOOD.replace('background:transparent', 'background:#ffffff');
  assert.ok(ids(bad).includes('body-not-transparent'));
});

test('warn: a missing mint accent is flagged (off-brand)', () => {
  const bad = GOOD.replace('#6EE7B7', '#cccccc');
  assert.ok(ids(bad).includes('brand-mint-missing'));
});

test('warn: using .select() on an input is flagged (focus, not select)', () => {
  const bad = GOOD.replace('document.getElementById(\'v\').textContent=n;', "document.getElementById('v').select();");
  assert.ok(ids(bad).includes('select-not-focus'));
});

test('error: a report() missing required fields is a hard-floor error (a broken stream lands nothing)', () => {
  const bad = GOOD.replace("Vitality.report({key:'water',label:'Water',value:n,date:today(),kind:'count'})", "Vitality.report({value:n})");
  const r = lintTile(bad);
  assert.ok(ids(bad).includes('report-shape'));
  const f = r.findings.find((x) => x.rule === 'report-shape');
  assert.equal(f!.severity, 'error', 'a malformed report() is now a hard error, not a warning');
  assert.equal(r.ok, false, 'a tile with a broken report() must fail the floor');
});

test('error: a report() with a kind outside the fixed taxonomy is rejected', () => {
  const bad = GOOD.replace("kind:'count'", "kind:'bogus'");
  const r = lintTile(bad);
  assert.ok(ids(bad).includes('report-kind-invalid'), JSON.stringify(r.findings));
  assert.equal(r.ok, false);
});

test('over-fire guard: a report() whose label carries a paren is not read as broken', () => {
  // firstCallArgs is string-literal aware, so a ")" inside a quoted label (or a crafted
  // name) does not truncate the args and false-flag the four required fields as missing.
  const withParen = GOOD.replace(
    "Vitality.report({key:'water',label:'Water',value:n,date:today(),kind:'count'})",
    "Vitality.report({key:'water',label:'Water (cups)',value:n,date:today(),kind:'count'})",
  );
  const r = lintTile(withParen);
  assert.equal(r.errors, 0, 'a paren in the label must not false-fail report-shape: ' + JSON.stringify(r.findings));
});

test('evasion: toISOString().substring is also caught (not just slice/split)', () => {
  const bad = GOOD.replace(/function today\(\)\{[^}]*\}/, 'function today(){return new Date().toISOString().substring(0,10)}');
  assert.ok(ids(bad).includes('date-utc-drift'));
});

test('evasion: a dynamic import of an external URL is caught', () => {
  const bad = GOOD.replace('var n=0;', "import('https://esm.sh/thing');var n=0;");
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('sealed-external-script'));
});

test('evasion: a keyframe animating margin-left (a -side layout prop) is caught', () => {
  const bad = GOOD.replace('</style>', '@keyframes slide{from{margin-left:0}to{margin-left:20px}}</style>');
  const r = lintTile(bad);
  assert.equal(r.ok, false);
  assert.ok(ids(bad).includes('motion-keyframe-layout'));
});

test('extended floor: a keyframe animating gap or inset (newly-listed layout props) is caught', () => {
  const gap = GOOD.replace('</style>', '@keyframes g{from{gap:0}to{gap:12px}}</style>');
  assert.ok(ids(gap).includes('motion-keyframe-layout'), 'gap is a layout prop');
  const inset = GOOD.replace('</style>', '@keyframes i{from{inset:0}to{inset:8px}}</style>');
  assert.ok(ids(inset).includes('motion-keyframe-layout'), 'inset is a layout prop');
});

test('extended floor: decorative non-emoji glyphs (star, alarm, sparkles) are rejected', () => {
  for (const glyph of ['⭐', '⏰', '✨']) {
    const bad = GOOD.replace('>add<', `>add ${glyph}<`);
    assert.ok(ids(bad).includes('no-emoji'), `glyph ${glyph.codePointAt(0)!.toString(16)} should be caught`);
  }
});

test('storage: a bare localStorage access is flagged even when an UNRELATED try exists', () => {
  // The old substring check passed if ANY try{} was present anywhere; this tile has a
  // try around something else and a bare localStorage outside it, which must still warn.
  const bad = GOOD.replace('var n=0;', "try{JSON.parse('{}')}catch(e){}var n=0;localStorage.setItem('n','1');");
  assert.ok(ids(bad).includes('storage-unwrapped'), 'a localStorage access outside every try must warn');
});

test('storage: a localStorage access wrapped in its own try/catch does not warn', () => {
  const ok = GOOD.replace('var n=0;', "var n=0;try{localStorage.setItem('n','1')}catch(e){}");
  assert.equal(ids(ok).includes('storage-unwrapped'), false, 'a wrapped access is fine');
});

test('error: an inline event-handler attribute (onclick=) in markup is rejected', () => {
  const bad = GOOD.replace('<button id="add">', '<button id="add" onclick="alert(1)">');
  const r = lintTile(bad);
  assert.equal(r.ok, false, 'an inline handler must fail the floor');
  assert.ok(ids(bad).includes('inline-event-handler'));
});

test('over-fire guard: addEventListener / .onclick= in JS is NOT an inline handler', () => {
  // The GOOD tile assigns document.getElementById('add').onclick=... in its script; that
  // JS property assignment is not an HTML attribute and must not trip the markup-only rule.
  assert.equal(ids(GOOD).includes('inline-event-handler'), false, 'a JS handler is not an inline attribute');
  const withListener = GOOD.replace("document.getElementById('add').onclick=function()", "document.getElementById('add').addEventListener('click',function()").replace('Vitality.report({key:\'water\',label:\'Water\',value:n,date:today(),kind:\'count\'})};', "Vitality.report({key:'water',label:'Water',value:n,date:today(),kind:'count'})});");
  assert.equal(ids(withListener).includes('inline-event-handler'), false, 'addEventListener is not an inline attribute');
});

test('warn: a tile with no Vitality bridge call is flagged (cannot persist or report)', () => {
  const bad = GOOD
    .replace(/var Vitality=\{[^;]*\};/, '')
    .replace('Vitality.save({n:n});Vitality.report({key:\'water\',label:\'Water\',value:n,date:today(),kind:\'count\'})', 'n=n');
  assert.ok(ids(bad).includes('bridge-missing'), 'a bridgeless tile must be flagged: ' + JSON.stringify(lintTile(bad).findings));
});

test('over-fire guard: a tile that uses the bridge does NOT get bridge-missing', () => {
  assert.equal(ids(GOOD).includes('bridge-missing'), false, 'the GOOD tile calls Vitality.save/report');
});

test('every scaffold_tile template is Vitality-grade: zero errors AND zero warnings', () => {
  const goals = ['track my water', 'meditation minutes', 'rate my mood out of 10', 'log my weight', 'track my daily spend', 'did I read today'];
  for (const goal of goals) {
    const full = scaffoldTile({ goal }).text;
    const html = full.slice(full.indexOf('<!doctype'));
    const r = lintTile(html);
    assert.equal(r.errors, 0, `scaffold "${goal}" must have 0 lint errors, got: ${JSON.stringify(r.findings.filter((f) => f.severity === 'error'))}`);
    assert.equal(r.warnings, 0, `scaffold "${goal}" must have 0 lint warnings, got: ${JSON.stringify(r.findings.filter((f) => f.severity === 'warn'))}`);
  }
});
