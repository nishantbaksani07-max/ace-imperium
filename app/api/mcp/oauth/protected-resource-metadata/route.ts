import { generateProtectedResourceMetadata } from 'mcp-handler'

import { appUrl, corsPreflight, jsonCors, mcpEnabled, mcpResourceUrl, MCP_SCOPES_SUPPORTED } from '../shared'

// RFC 9728 Protected Resource Metadata. Served (via next.config rewrite) at the
// canonical `/.well-known/oauth-protected-resource`, which is also the URL we
// advertise in the MCP route's `WWW-Authenticate: resource_metadata=...` 401.
// It tells the client which Authorization Server to use — us (appUrl is the
// issuer). `resource` MUST string-equal the JSON-RPC endpoint (/api/mcp/mcp)
// for RFC 8707 audience binding.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })
  const base = appUrl()
  if (!base) return jsonCors({ error: 'mcp_misconfigured' }, { status: 500 })

  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [base], // we are the AS; issuer == appUrl
    resourceUrl: mcpResourceUrl(base),
    additionalMetadata: {
      scopes_supported: MCP_SCOPES_SUPPORTED,
      bearer_methods_supported: ['header'],
    },
  })
  return jsonCors(metadata)
}

export function OPTIONS(): Response {
  return corsPreflight()
}
