import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerTools } from './tools.js';

// Minimal fake McpServer that captures registered tools and lets us invoke handlers.
function fakeServer() {
  const tools: Record<string, { def: unknown; handler: (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> }> = {};
  const server = {
    registerTool(name: string, def: unknown, handler: (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>) {
      tools[name] = { def, handler };
    },
  };
  return { server: server as never, tools };
}

test('scaffold_tile is registered and returns the tile as text', async () => {
  const { server, tools } = fakeServer();
  // getVdb must never be called by scaffold_tile; throw if it is.
  registerTools(server, async () => {
    throw new Error('getVdb must not be called');
  });
  assert.ok(tools['scaffold_tile'], 'tool registered');
  const res = await tools['scaffold_tile'].handler({ goal: 'beer tracker' });
  const text = res.content[0].text;
  assert.match(text, /tile is ready/);
  assert.match(text, /copy everything below this line/i);
  assert.match(text, /<!doctype html>/);
  assert.match(text, /Vitality\.report\(/);
  assert.notEqual(res.isError, true);
});
