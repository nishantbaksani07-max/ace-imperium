/**
 * Crypto coin registry — maps what a user types ("BTC", "bitcoin", "Bitcoin")
 * to a CoinGecko coin id ("bitcoin"), and back to a display symbol ("BTC").
 *
 * A small curated list of the common coins keeps the "add crypto" flow instant
 * (no extra coin-list lookup round-trip). Unknown inputs fall through to a
 * manual crypto entry. Extend COINS as needed — order is display order.
 */

export interface CoinMeta {
  /** CoinGecko coin id, e.g. "bitcoin". This is what /api/finance/crypto-quote queries. */
  id: string
  /** Display ticker, e.g. "BTC". */
  symbol: string
  /** Human name, e.g. "Bitcoin". */
  name: string
}

export const COINS: CoinMeta[] = [
  { id: 'bitcoin',      symbol: 'BTC',   name: 'Bitcoin' },
  { id: 'ethereum',     symbol: 'ETH',   name: 'Ethereum' },
  { id: 'solana',       symbol: 'SOL',   name: 'Solana' },
  { id: 'ripple',       symbol: 'XRP',   name: 'XRP' },
  { id: 'cardano',      symbol: 'ADA',   name: 'Cardano' },
  { id: 'dogecoin',     symbol: 'DOGE',  name: 'Dogecoin' },
  { id: 'polkadot',     symbol: 'DOT',   name: 'Polkadot' },
  { id: 'chainlink',    symbol: 'LINK',  name: 'Chainlink' },
  { id: 'litecoin',     symbol: 'LTC',   name: 'Litecoin' },
  { id: 'avalanche-2',  symbol: 'AVAX',  name: 'Avalanche' },
  { id: 'polygon-ecosystem-token', symbol: 'POL', name: 'Polygon' },
  { id: 'tron',         symbol: 'TRX',   name: 'TRON' },
  { id: 'uniswap',      symbol: 'UNI',   name: 'Uniswap' },
  { id: 'stellar',      symbol: 'XLM',   name: 'Stellar' },
  { id: 'cosmos',       symbol: 'ATOM',  name: 'Cosmos' },
  { id: 'monero',       symbol: 'XMR',   name: 'Monero' },
  { id: 'aave',         symbol: 'AAVE',  name: 'Aave' },
  { id: 'shiba-inu',    symbol: 'SHIB',  name: 'Shiba Inu' },
  { id: 'tether',       symbol: 'USDT',  name: 'Tether' },
  { id: 'usd-coin',     symbol: 'USDC',  name: 'USD Coin' },
]

const BY_KEY: Record<string, CoinMeta> = (() => {
  const map: Record<string, CoinMeta> = {}
  for (const c of COINS) {
    map[c.id.toLowerCase()] = c
    map[c.symbol.toLowerCase()] = c
    map[c.name.toLowerCase()] = c
  }
  return map
})()

/** Resolve a user-typed coin (symbol / id / name) to its registry entry, or null. */
export function resolveCoin(input: string): CoinMeta | null {
  const k = (input || '').trim().toLowerCase()
  if (!k) return null
  return BY_KEY[k] ?? null
}

/** Display symbol for a known coin id ("bitcoin" → "BTC"); falls back to the id uppercased. */
export function symbolForId(coinId: string): string {
  const c = BY_KEY[(coinId || '').toLowerCase()]
  return c ? c.symbol : (coinId || '').toUpperCase()
}
