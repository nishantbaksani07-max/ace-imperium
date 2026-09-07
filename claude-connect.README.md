# Ask Claude (drop-in button)

Add one button to any dashboard so people can chat with Claude about their own data.
No server, no signup, no API keys. You host nothing. Their data stays on their device.

## Add it (one line)

Put this just before `</body>` in your dashboard:

```html
<script src="claude-connect.js"></script>
```

That is the whole setup. An "Ask Claude" button appears in the corner on its own.

## What your users do

1. Tap **Ask Claude**.
2. Tap **Download for Claude** (or **Copy instead**).
3. Drag that file into Claude, or paste it. Claude starts coaching them right away.

There is no prompt to type. The instructions are baked into the file.

## Optional: name it and color it

Set this **before** the script tag. All fields are optional.

```html
<script>
  window.ClaudeConnect = {
    name: 'Sleep Tracker',   // shown in the button and file. Defaults to the page title.
    accent: '#6BE3A4',       // button glow color. Defaults to mint.
    prefix: 'vitality_',     // only export keys that start with this. Defaults to all data.
    // keys: ['vitality_sleep_v1'],  // or list exact keys to export.
  };
</script>
<script src="claude-connect.js"></script>
```

## How it works

The button reads your dashboard's `localStorage` when tapped, wraps it in a short
coaching instruction, and saves it as a `.md` file. That is it. The script never
writes to your data and never sends it anywhere. Sharing only happens when the user
chooses to drop the file into Claude.

## Good to know

- This is a **snapshot**. To re-check later, the user taps the button again for a fresh file.
- Want it always live, with no re-exporting? That needs a hosted version (your own app). This
  free local button is the easy on-ramp.
- Try `claude-connect-demo.html` to see the button on a tiny example dashboard.
