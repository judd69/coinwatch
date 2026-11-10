/**
 * CoinGecko markets client (free tier, no key required).
 *
 * Endpoint:
 *   https://api.coingecko.com/api/v3/coins/markets
 *     ?vs_currency=inr|usd&order=market_cap_desc&per_page=100&page=1
 *     &sparkline=true&price_change_percentage=24h
 *
 * Honesty note: CoinGecko prices are aggregates across exchanges — they are
 * NOT an exchange's executable price. CoinWatch never invents a price: on a
 * 429 or a network failure the caller keeps the last good data and the UI
 * says so.
 *
 * Quirk worth knowing: the `sparkline_in_7d.price` array is denominated in
 * USD even when `vs_currency=inr`. The array's *shape* is currency
 * independent, so it draws correctly as-is; for the 7d high/low shown in the
 * detail panel the app converts the sparkline through the implied rate
 * (current price ÷ last sparkline point) — see `sparklineToDisplayCurrency`
 * in main.ts.
 */

export type Currency = 'inr' | 'usd';

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  last_updated: string;
  /** 168 hourly points (7 days); denominated in USD regardless of vs_currency. */
  sparkline_in_7d: { price: number[] };
}

export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | undefined;
  constructor(retryAfterSeconds?: number) {
    super(
      'CoinGecko rate limit reached (free tier). Your last good prices are still shown — CoinWatch will retry on the next refresh.',
    );
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Could not reach CoinGecko. Your last good prices are still shown — check your connection and try refreshing.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export const MARKETS_BASE_URL = 'https://api.coingecko.com/api/v3/coins/markets';

export function buildMarketsUrl(currency: Currency): string {
  const params = new URLSearchParams({
    vs_currency: currency,
    order: 'market_cap_desc',
    per_page: '100',
    page: '1',
    sparkline: 'true',
    price_change_percentage: '24h',
  });
  return `${MARKETS_BASE_URL}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Validate + normalise one raw market entry. Returns null when the entry is
 * missing a required field (id, name, current_price) so the caller can drop
 * it; throws nothing for a single bad row.
 */
export function parseCoin(raw: unknown): Coin | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  const currentPrice = asFiniteNumber(raw.current_price);
  if (id === null || name === null || currentPrice === null) return null;

  const sparkRaw = isRecord(raw.sparkline_in_7d) ? raw.sparkline_in_7d.price : undefined;
  const sparkPrices = Array.isArray(sparkRaw)
    ? sparkRaw.filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
    : [];

  return {
    id,
    symbol: asString(raw.symbol) ?? id,
    name,
    image: asString(raw.image) ?? '',
    current_price: currentPrice,
    market_cap: asFiniteNumber(raw.market_cap) ?? 0,
    market_cap_rank: asFiniteNumber(raw.market_cap_rank) ?? 0,
    total_volume: asFiniteNumber(raw.total_volume) ?? 0,
    high_24h: asFiniteNumber(raw.high_24h),
    low_24h: asFiniteNumber(raw.low_24h),
    price_change_24h: asFiniteNumber(raw.price_change_24h),
    price_change_percentage_24h: asFiniteNumber(raw.price_change_percentage_24h),
    ath: asFiniteNumber(raw.ath),
    ath_change_percentage: asFiniteNumber(raw.ath_change_percentage),
    last_updated: asString(raw.last_updated) ?? '',
    sparkline_in_7d: { price: sparkPrices },
  };
}

/**
 * Parse a markets payload. Throws on a malformed payload (not an array, or
 * no usable coin entries at all) — a bad payload is never silently treated
 * as "no coins".
 */
export function parseMarkets(payload: unknown): Coin[] {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid markets payload: expected a JSON array from CoinGecko.');
  }
  const coins = payload.map(parseCoin).filter((c): c is Coin => c !== null);
  if (coins.length === 0) {
    throw new Error('Invalid markets payload: no usable coin entries.');
  }
  return coins;
}

export async function fetchMarkets(currency: Currency, fetchImpl: typeof fetch = fetch): Promise<Coin[]> {
  let response: Response;
  try {
    response = await fetchImpl(buildMarketsUrl(currency), {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new NetworkError();
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter === null ? undefined : Number.parseInt(retryAfter, 10);
    throw new RateLimitedError(Number.isFinite(seconds) ? seconds : undefined);
  }
  if (!response.ok) {
    throw new NetworkError(`CoinGecko returned HTTP ${response.status}. Your last good prices are still shown.`);
  }
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new NetworkError('CoinGecko returned a response CoinWatch could not read. Your last good prices are still shown.');
  }
  return parseMarkets(payload);
}
