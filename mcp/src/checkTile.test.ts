import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTile } from './checkTile.js';

const GOOD = `<!doctype html><html><head><meta charset="utf-8"><style>
body{background:transparent;color:#fff}
.v{color:#6EE7B7;transition:opacity .2s}
::selection{background:rgba(110,231,183,.25)}
@media (prefers-reduced-motion: reduce){*{transition:none !important}}
</style></head><body><div class="v">0</div><script>
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
var Vitality={report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}};
Vitality.report({key:'x',label:'X',value:1,date:today(),kind:'count'});
</script></body></html>`;

test('checkTile passes a clean tile and reports a grade', () => {
  const r = checkTile(GOOD);
  assert.equal(r.ok, true);
  assert.match(r.text, /PASS/);
});

test('checkTile fails a broken tile and names the error rule', () => {
  const r = checkTile('<div>not a real tile</div>');
  assert.equal(r.ok, false);
  assert.match(r.text, /FAIL/);
  assert.match(r.text, /doc-structure/);
});

test('checkTile surfaces an external-script error so the builder can fix it', () => {
  const bad = GOOD.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>');
  const r = checkTile(bad);
  assert.equal(r.ok, false);
  assert.match(r.text, /sealed-external-script/);
});

// ---- the Proof line (the add_tile re-lint diet) -----------------------------
// The proof key is env-derived and FAILS CLOSED (no secret = no proof, full
// lint), so the proof tests pin a test secret; the keyless test clears it.

process.env.MCP_CHECK_PROOF_SECRET = 'checkTile-test-secret';

test('a PASSING receipt carries a Proof line that verifies for the identical html', async () => {
  const { checkProofFor, verifyCheckProof } = await import('./checkTile.js');
  const r = checkTile(GOOD);
  assert.equal(r.ok, true);
  const m = /Proof: ([0-9a-f]{32})/.exec(r.text);
  assert.ok(m, 'the PASS receipt names a 32-hex Proof value');
  assert.equal(m![1], checkProofFor(GOOD));
  assert.equal(verifyCheckProof(GOOD, m![1]), true);
  // whitespace-trimmed html is the same proof (add_tile trims before checking)
  assert.equal(verifyCheckProof(`  ${GOOD}\n`, m![1]), true);
});

test('a FAILING receipt carries NO Proof (nothing unproven can skip the lint)', () => {
  const r = checkTile('<div>not a real tile</div>');
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.text, /Proof:/);
});

test('any edit to the html invalidates the proof; garbage never verifies', async () => {
  const { checkProofFor, verifyCheckProof } = await import('./checkTile.js');
  const proof = checkProofFor(GOOD);
  assert.equal(verifyCheckProof(GOOD.replace('kind:\'count\'', 'kind:\'intake\''), proof), false);
  assert.equal(verifyCheckProof(GOOD, 'deadbeef'), false);
  assert.equal(verifyCheckProof(GOOD, undefined), false);
  assert.equal(verifyCheckProof(GOOD, null), false);
  assert.equal(verifyCheckProof(GOOD, ''), false);
});

test('no server secret = fail closed: no Proof line, nothing ever verifies', async () => {
  const { checkProofFor, verifyCheckProof } = await import('./checkTile.js');
  const savedSecret = process.env.MCP_CHECK_PROOF_SECRET;
  const savedRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mintedWithKey = checkProofFor(GOOD);
  delete process.env.MCP_CHECK_PROOF_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const r = checkTile(GOOD);
    assert.equal(r.ok, true);
    assert.doesNotMatch(r.text, /Proof:/);
    assert.equal(checkProofFor(GOOD), null);
    // even a proof minted while a key existed is refused keyless (never a
    // public-constant fallback an attacker could reproduce offline)
    assert.equal(verifyCheckProof(GOOD, mintedWithKey), false);
  } finally {
    if (savedSecret !== undefined) process.env.MCP_CHECK_PROOF_SECRET = savedSecret;
    if (savedRole !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedRole;
  }
});
