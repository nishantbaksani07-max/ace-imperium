import { AsyncLocalStorage } from 'node:async_hooks'

import { createMcpHandler } from 'mcp-handler'

import { registerTools } from '@/mcp/src/tools'
import { registerResources } from '@/mcp/src/resources'
import type { VitalityDb } from '@/mcp/src/supabase'

import { authenticateMcpRequest } from '../auth'

// Hosted, Stripe-gated MCP endpoint — the headless analogue of an RLS-scoped
// Next.js route handler. Streamable-HTTP lives at /api/mcp/mcp (the [transport]
// segment resolves to `mcp`). Stateless and per-request: one process safely
// serves many users because identity comes from the credential, not a singleton.
//
// Threading: the 16 tools were written against a single `getVdb` provider
// (`registerTools(server, getVdb)`), shared verbatim with the stdio CLI. Each
// HTTP request authenticates to a *different* user, so we thread that request's
// RLS client through an AsyncLocalStorage rather than rebuilding the handler per
// request. createMcpHandler instantiates a fresh McpServer per request and calls
// our initializer inside the request flow, so the store is always populated by
// the time a tool calls getVdb().

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Pro (brand/insight + nutrition/parse-meal already use 60)

const vdbStore = new AsyncLocalStorage<VitalityDb>()

const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server, async () => {
      const vdb = vdbStore.getStore()
      if (!vdb) throw new Error('No Vitality session in request context')
      return vdb
    })
    // Ambient tile-engine context (design DNA + domain kits). Identity-free and
    // read-only, so it registers once per request-scoped server like the tools.
    registerResources(server)
  },
  { serverInfo: { name: 'vitality', version: '0.1.0' } },
  {
    basePath: '/api/mcp', // → streamable endpoint at /api/mcp/mcp
    maxDuration: 60,
    sessionIdGenerator: undefined, // EXPLICIT stateless: never share a transport across invocations
    disableSse: true, // Phase 1 is Claude Code CLI (streamable HTTP); no Redis/KV needed
    verboseLogs: process.env.NODE_ENV !== 'production',
  },
)

function errorResponse(status: number, error: string): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  // RFC 9728 §5.1: a 401 from the resource server points the client at its
  // Protected Resource Metadata so an OAuth client (claude.ai / Desktop /
  // mobile) can discover the Authorization Server and start the sign-in dance.
  // Only meaningful once Phase 2 OAuth is live, but harmless before then.
  if (status === 401) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
    if (base) {
      headers['WWW-Authenticate'] =
        `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
    }
  }
  return Response.json({ error }, { status, headers })
}

async function handler(req: Request): Promise<Response> {
  // Dark-launch flag, read per-request (module-scope reads miss env changes
  // without a redeploy). Default OFF → 404, indistinguishable from "no route".
  if (process.env.MCP_ENABLED !== 'true') {
    return new Response('Not found', { status: 404 })
  }

  const auth = await authenticateMcpRequest(req)
  if (!auth.ok) return errorResponse(auth.status, auth.error)

  return vdbStore.run(auth.vdb, () => mcpHandler(req))
}

export { handler as GET, handler as POST }
