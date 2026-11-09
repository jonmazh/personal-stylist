import { NextResponse } from 'next/server'

/**
 * Perfil UCP público del agente (la app como «plataforma»): las tiendas UCP lo descargan para negociar capacidades.
 * Declara SOLO consulta de catálogo (search y lookup): ni carrito, ni checkout, ni pedidos.
 * Requisitos de UCP: HTTPS, sin redirecciones y Cache-Control público con max-age ≥ 60 s.
 * Publica esta URL como SHOPPING_UCP_PROFILE_URL (p. ej. https://tu-dominio/.well-known/ucp).
 */
export const dynamic = 'force-static'
const VERSION = '2026-08-25'
export const UCP_AGENT_PROFILE = {
  ucp: {
    version: VERSION,
    services: { 'dev.ucp.shopping': [{ version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/overview/`, transport: 'mcp', schema: `https://ucp.dev/${VERSION}/services/shopping/mcp.openrpc.json` }] },
    capabilities: {
      'dev.ucp.shopping.catalog.search': [{ version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/shopping/catalog/`, schema: `https://ucp.dev/${VERSION}/schemas/shopping/catalog_search.json` }],
      'dev.ucp.shopping.catalog.lookup': [{ version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/shopping/catalog/`, schema: `https://ucp.dev/${VERSION}/schemas/shopping/catalog_lookup.json` }],
    },
    payment_handlers: {},
  },
}
export function GET() {
  return NextResponse.json(UCP_AGENT_PROFILE, { headers: { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } })
}
