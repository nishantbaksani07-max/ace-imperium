// One-shot CLI: print the daily briefing to stdout, then exit.
//
//   npm run briefing            # human-readable
//   npm run briefing -- --json  # machine-readable (for piping into an agent)
//
// Handy for testing your .env and for a cron that doesn't go through MCP.

import { getDb } from './supabase.js';
import { buildBriefing, renderBriefing } from './nudges.js';

async function main() {
  const json = process.argv.includes('--json');
  const v = await getDb();
  const briefing = await buildBriefing(v);
  if (json) {
    process.stdout.write(JSON.stringify(briefing, null, 2) + '\n');
  } else {
    process.stdout.write(renderBriefing(briefing) + '\n');
  }
}

main().catch((err) => {
  console.error('[vitality-mcp] briefing failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
