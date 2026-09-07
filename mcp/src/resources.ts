// MCP resources for the Vitality Tile Engine — the CONNECTOR half of the engine.
//
// Tools are commands you call; RESOURCES are ambient context that just loads when a
// client connects. This exposes the same on-brand tile-building reference the
// `vitality_tile_kit` TOOL serves (mcp/dna + worked-example tiles), but as
// RESOURCES — so once the Vitality MCP is connected, "build me a tile that looks
// like the app" works with zero commands: the look/feel/voice is ambient context.
//
// Read-only, no user data, no per-request identity — safe to register once on any
// transport. Reuses tileKit (buildKit / listSections / readSection) verbatim, so
// the mcp/dna pack stays the single source of truth (no second copy to drift).
//
// Wired into BOTH transports:
//   • CLI    — mcp/src/index.ts        (registerResources(server))
//   • hosted — app/api/mcp/[transport]/route.ts (inside createMcpHandler)

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildKit, listSections, readSection } from './tileKit.js';

const MD = 'text/markdown';

// The canonical tile kinds worth surfacing in a listing. DOMAIN in tileKit also
// holds aliases (food/nutrition/macro → same bundle); these are the headline set.
// A read of any key still works — buildKit falls back to the BASE pack for unknowns.
const CANON_DOMAINS = [
  'food', 'workout', 'supplement', 'weight', 'vitals', 'goals',
  'water', 'peak', 'finance', 'brand', 'mentor', 'vee',
];

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Register the engine's ambient-context resources on `server`. Identity-free and
 * idempotent per server instance — call once, right after registerTools.
 */
export function registerResources(server: McpServer): void {
  // 1) Orientation — the "read this first" brain. Same text the kit tool opens
  //    with: the standard, the sealed-tile contract, and the reference index.
  server.registerResource(
    'vitality-engine',
    'vitality://engine',
    {
      title: 'Vitality Tile Engine — start here',
      description:
        'How to build a Vitality-native dashboard tile: the bar, the sealed-tile bridge contract, and the reference index. Read this first, then pull a domain kit or a DNA section.',
      mimeType: MD,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: MD, text: buildKit({}) }],
    }),
  );

  // 2) DNA sections — the look / feel / voice reference, one file per resource
  //    (theme, motion, voice, gotchas, the feature recipes, the worked-example tiles).
  server.registerResource(
    'vitality-dna',
    new ResourceTemplate('vitality://dna/{name}', {
      list: async () => ({
        resources: listSections().map((s) => ({
          uri: `vitality://dna/${s.name}`,
          name: s.name,
          title: `Vitality DNA — ${s.name}`,
          description: `Reference section (${s.folder}) from the Vitality design DNA pack.`,
          mimeType: MD,
        })),
      }),
    }),
    {
      title: 'Vitality DNA section',
      description:
        'One reference file from the Vitality design DNA pack: theme, motion, voice, icons, components, the gotchas rulebook, per-feature recipes, and complete worked-example tiles.',
      mimeType: MD,
    },
    async (uri, variables) => {
      const name = first(variables.name);
      const body = readSection(name);
      const text =
        body ??
        `No DNA section "${name}". Available: ${listSections().map((s) => s.name).join(', ')}`;
      return { contents: [{ uri: uri.href, mimeType: MD, text }] };
    },
  );

  // 3) Domain kits — the universal look/feel/voice BASE plus the reference for one
  //    tile kind, bundled into a single build context (what buildKit({domain}) returns).
  server.registerResource(
    'vitality-kit',
    new ResourceTemplate('vitality://kit/{domain}', {
      list: async () => ({
        resources: CANON_DOMAINS.map((d) => ({
          uri: `vitality://kit/${d}`,
          name: d,
          title: `Vitality tile kit — ${d}`,
          description: `Focused build bundle for a ${d} tile: the universal look/feel/voice plus ${d}-specific reference.`,
          mimeType: MD,
        })),
      }),
    }),
    {
      title: 'Vitality tile kit (by domain)',
      description:
        'The design DNA plus the domain reference for one tile kind (food, workout, vitals, finance, mentor, goals, …), bundled into one build context.',
      mimeType: MD,
    },
    async (uri, variables) => ({
      contents: [{ uri: uri.href, mimeType: MD, text: buildKit({ domain: first(variables.domain) }) }],
    }),
  );
}
