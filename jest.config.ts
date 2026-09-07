import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // The mcp/ package is authored ESM-style with explicit ".js" on relative
    // imports (so its tsc build resolves at runtime). Jest resolves against the
    // ".ts" source, so strip the extension. Only mcp/ uses ".js" specifiers;
    // app/lib/components don't, so this is a no-op for them. MUST precede the
    // "@/" mapper — first match wins.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Jest was discovering and running stale tests in parallel git worktrees,
  // which use a frozen copy of the schema/mocks and always fail. They are
  // not part of main's test surface.
  //
  // docs/patreon/factory/*.test.mjs AND mcp/src/**/*.test.ts use Node's built-in
  // test runner (node:test), not jest. Run them with `node --test`. Jest can't see
  // node:test registrations, so it wrongly reports "must contain at least one
  // test"; ignore those paths here so `npm test` stays green.
  testPathIgnorePatterns: ['/node_modules/', '/.worktrees/', '/.claude/worktrees/', '/.next/', '/docs/patreon/factory/', '/mcp/'],
  // Keep the haste map from crawling the worktree copies too (they share the
  // package name "vitality", which otherwise collides and can hang the crawl).
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/', '<rootDir>/.claude/worktrees/'],
}

export default createJestConfig(config)
