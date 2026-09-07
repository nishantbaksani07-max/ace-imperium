/*
  claude-connect.js
  A drop-in "Ask Claude" button for any dashboard. No backend, no signup, no keys.

  WHAT IT DOES
  Adds one floating button to your dashboard. When a user taps it, it reads the
  dashboard's own data (everything in localStorage), wraps it in a short coaching
  instruction for Claude, and hands them a ready-to-go file (or copies it). They
  drag that file into Claude and start chatting. No prompt to type. Nothing leaves
  their computer until they choose to share it. The dashboard owner hosts nothing.

  HOW TO ADD IT (one line, right before </body>)
      <script src="claude-connect.js"></script>

  That is the whole install. The button appears on its own.

  OPTIONAL: name it and color it (set this BEFORE the script tag)
      <script>
        window.ClaudeConnect = {
          name: 'Sleep Tracker',      // shown in the file and button. Defaults to the page title.
          accent: '#6BE3A4',          // button glow color. Defaults to mint.
          prefix: 'vitality_',        // only export keys starting with this. Defaults to all data.
          // keys: ['vitality_sleep_v1'], // or pick exact keys to export.
        };
      </script>

  STATE: this script keeps no state of its own. It only READS the host page's
  localStorage when the button is tapped. It never writes to it.
*/
(function () {
  // Guard so adding the script twice does nothing.
  if (window.__claudeConnectLoaded) return;
  window.__claudeConnectLoaded = true;

  var cfg = window.ClaudeConnect || {};
  var APP_NAME = (cfg.name || document.title || 'My dashboard').trim();
  var ACCENT = cfg.accent || '#6BE3A4';

  // ---- Read the dashboard's data out of localStorage -------------------------
  // For a single-purpose dashboard, everything in localStorage IS the data, so by
  // default we take all of it. Set cfg.prefix or cfg.keys to narrow it.
  function gather() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      if (k === '__claudeConnectLoaded') continue;
      if (cfg.prefix && k.indexOf(cfg.prefix) !== 0) continue;
      if (cfg.keys && cfg.keys.indexOf(k) === -1) continue;
      var raw = localStorage.getItem(k);
      try { out[k] = JSON.parse(raw); } catch (e) { out[k] = raw; }
    }
    return out;
  }

  // ---- Build the file Claude reads. The instructions are baked in, so the user
  //      does not paste anything. They just drop this in. ----------------------
  function buildDoc() {
    var data = gather();
    var isEmpty = Object.keys(data).length === 0;
    var when = new Date().toLocaleString();
    var lines = [];
    lines.push('# My ' + APP_NAME + ' data');
    lines.push('');
    lines.push('Hey Claude, read this and be my coach for this dashboard.');
    lines.push('First give me a short briefing: what is going well, what I am behind on, and one thing to do today. Then answer any questions I ask about the data below. Do not invent numbers that are not here.');
    lines.push('');
    lines.push('Exported ' + when + ' from ' + APP_NAME + '.');
    lines.push('');
    lines.push('## My data');
    lines.push('');
    if (isEmpty) {
      lines.push('(No data saved yet. I have not used the dashboard much, so coach me on getting started.)');
    } else {
      lines.push('```json');
      lines.push(JSON.stringify(data, null, 2));
      lines.push('```');
    }
    return lines.join('\n');
  }

  function slug() {
    return (APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashboard') + '-for-claude.md';
  }

  function download() {
    var blob = new Blob([buildDoc()], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = slug();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Saved. Drag the file into Claude.');
  }

  function copy() {
    var text = buildDoc();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Copied. Paste it into Claude.'); },
        function () { fallbackCopy(text); }
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied. Paste it into Claude.'); }
    catch (e) { toast('Could not copy. Use Download instead.'); }
    document.body.removeChild(ta);
  }

  // ---- UI lives in a shadow root so it cannot clash with the host page's CSS --
  var host = document.createElement('div');
  host.setAttribute('data-claude-connect', '');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  document.body.appendChild(host);

  root.innerHTML = [
    '<style>',
    ':host, * { box-sizing: border-box; }',
    '.cc-wrap { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }',
    '.cc-fab { display: inline-flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 18px; border-radius: 999px; cursor: pointer; color: #FAFAFA; font-size: 14px; font-weight: 600; letter-spacing: 0.005em;',
    '  background: rgba(20,20,22,0.82); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border: 1px solid ' + hexA(ACCENT, 0.55) + ';',
    '  box-shadow: 0 1px 0 0 rgba(255,255,255,0.06) inset, 0 10px 30px rgba(0,0,0,0.5), 0 0 22px ' + hexA(ACCENT, 0.28) + '; transition: transform 0.12s ease, box-shadow 0.18s ease; }',
    '.cc-fab:hover { transform: translateY(-1px); box-shadow: 0 1px 0 0 rgba(255,255,255,0.08) inset, 0 14px 36px rgba(0,0,0,0.6), 0 0 30px ' + hexA(ACCENT, 0.42) + '; }',
    '.cc-fab:active { transform: translateY(0) scale(0.98); }',
    '.cc-dot { width: 9px; height: 9px; border-radius: 50%; background: ' + ACCENT + '; box-shadow: 0 0 10px ' + ACCENT + '; }',
    '.cc-sheet { position: absolute; right: 0; bottom: 58px; width: 268px; padding: 16px; border-radius: 18px; opacity: 0; transform: translateY(8px) scale(0.98); pointer-events: none; transition: opacity 0.16s ease, transform 0.16s ease;',
    '  background: rgba(16,16,18,0.94); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 1px 0 0 rgba(255,255,255,0.05) inset, 0 18px 50px rgba(0,0,0,0.6); }',
    '.cc-sheet.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }',
    '.cc-title { font-size: 13px; color: #B8B6B0; margin: 0 0 12px; line-height: 1.4; }',
    '.cc-btn { display: block; width: 100%; text-align: center; min-height: 44px; padding: 0 14px; border-radius: 12px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; margin-top: 8px; transition: transform 0.12s ease, background 0.18s ease; }',
    '.cc-btn:active { transform: scale(0.98); }',
    '.cc-primary { background: linear-gradient(180deg, #FFFFFF 0%, #E8E5DD 100%); color: #0A0A0B; border: 1px solid rgba(255,255,255,0.85); box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px rgba(0,0,0,0.45); }',
    '.cc-primary:hover { background: linear-gradient(180deg, #FFFFFF 0%, #F2F0EA 100%); }',
    '.cc-secondary { background: rgba(255,255,255,0.04); color: #FAFAFA; border: 1px solid rgba(255,255,255,0.10); }',
    '.cc-secondary:hover { background: rgba(255,255,255,0.085); }',
    '.cc-hint { font-size: 11px; color: #76746E; margin: 12px 2px 0; line-height: 1.4; font-style: italic; }',
    '.cc-toast { position: absolute; right: 0; bottom: 58px; max-width: 280px; padding: 11px 14px; border-radius: 12px; font-size: 12.5px; color: #0A0A0B; font-weight: 600;',
    '  background: ' + ACCENT + '; box-shadow: 0 10px 30px rgba(0,0,0,0.5); opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease; }',
    '.cc-toast.show { opacity: 1; transform: translateY(0); }',
    '@media (prefers-reduced-motion: reduce) { .cc-fab, .cc-sheet, .cc-btn, .cc-toast { transition: none; } }',
    '</style>',
    '<div class="cc-wrap">',
    '  <div class="cc-toast" id="cc-toast"></div>',
    '  <div class="cc-sheet" id="cc-sheet">',
    '    <p class="cc-title">Send your ' + esc(APP_NAME) + ' to Claude and chat with it.</p>',
    '    <button class="cc-btn cc-primary" id="cc-download">Download for Claude</button>',
    '    <button class="cc-btn cc-secondary" id="cc-copy">Copy instead</button>',
    '    <p class="cc-hint">Drag the file into Claude, or paste. Your data stays on your device.</p>',
    '  </div>',
    '  <button class="cc-fab" id="cc-fab"><span class="cc-dot"></span>Ask Claude</button>',
    '</div>'
  ].join('');

  var sheet = root.getElementById('cc-sheet');
  var fab = root.getElementById('cc-fab');
  var toastEl = root.getElementById('cc-toast');
  var toastTimer;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    sheet.classList.remove('open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    sheet.classList.toggle('open');
  });
  root.getElementById('cc-download').addEventListener('click', download);
  root.getElementById('cc-copy').addEventListener('click', copy);
  document.addEventListener('click', function (e) {
    if (!host.contains(e.target)) sheet.classList.remove('open');
  });

  // Small helpers.
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function hexA(hex, a) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return 'rgba(107,227,164,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }
})();
