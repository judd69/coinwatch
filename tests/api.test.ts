import { describe, expect, it } from 'vitest';
import { buildMarketsUrl, fetchMarkets, parseMarkets, RateLimitedError } from '../src/api';
import snapshot from '../examples/markets-inr.json';

function loadSnapshot(): unknown {
  return snapshot as unknown;
}

describe('buildMarketsUrl', () => {
  it('asks for the top 100 in INR with sparklines and 24h change', () => {
    const url = buildMarketsUrl('inr');
    expect(url).toContain('https://api.coingecko.com/api/v3/coins/markets');
    expect(url).toContain('vs_currency=inr');
    expect(url).toContain('per_page=100');
    expect(url).toContain('sparkline=true');
    expect(url).toContain('price_change_percentage=24h');
  });
  it('switches currency for the USD toggle', () => {
    expect(buildMarketsUrl('usd')).toContain('vs_currency=usd');
  });
});

describe('parseMarkets — the saved 2026-11-10 snapshot', () => {
  it('parses all 20 coins from examples/markets-inr.json', () => {
    const coins = parseMarkets(loadSnapshot());
    expect(coins).toHaveLength(20);
  });
  it('reads the snapshot BTC price, 24h change and 168-point sparkline', () => {
    const coins = parseMarkets(loadSnapshot());
    const btc = coins.find((c) => c.id === 'bitcoin');
    expect(btc).toBeDefined();
    expect(btc!.current_price).toBe(7004743);
    expect(btc!.price_change_percentage_24h).toBeCloseTo(-1.10029, 4);
    expect(btc!.sparkline_in_7d.price).toHaveLength(168);
    expect(btc!.market_cap_rank).toBe(1);
    expect(btc!.ath).toBe(11187013);
  });
  it('keeps a coin with a null 24h change (figure-heloc) instead of dropping it', () => {
    const coins = parseMarkets(loadSnapshot());
    const fig = coins.find((c) => c.id === 'figure-heloc');
    expect(fig).toBeDefined();
    expect(fig!.price_change_percentage_24h).toBeNull();
    expect(fig!.sparkline_in_7d.price.length).toBeGreaterThan(0);
  });
  it('ranks match market-cap order in the snapshot', () => {
    const coins = parseMarkets(loadSnapshot());
    expect(coins[0].id).toBe('bitcoin');
    expect(coins[1].id).toBe('ethereum');
    expect(coins[2].id).toBe('tether');
  });
});

describe('parseMarkets — malformed payloads are rejected', () => {
  it('rejects a non-array payload', () => {
    expect(() => parseMarkets({})).toThrow(/Invalid markets payload/);
    expect(() => parseMarkets(null)).toThrow(/Invalid markets payload/);
    expect(() => parseMarkets('nope')).toThrow(/Invalid markets payload/);
  });
  it('rejects an array with no usable coin entries', () => {
    expect(() => parseMarkets([{ id: 'x' }])).toThrow(/Invalid markets payload/);
    expect(() => parseMarkets([])).toThrow(/Invalid markets payload/);
  });
  it('drops a single bad row but keeps the good ones', () => {
    const coins = parseMarkets([
      { id: 'bitcoin', name: 'Bitcoin', current_price: 7004743 },
      { id: 'broken' },
      'garbage',
    ]);
    expect(coins).toHaveLength(1);
    expect(coins[0].id).toBe('bitcoin');
  });
});

describe('fetchMarkets — error mapping', () => {
  it('throws RateLimitedError on HTTP 429', async () => {
    const fakeFetch = (async () =>
      new Response('[]', { status: 429, headers: { 'retry-after': '60' } })) as unknown as typeof fetch;
    await expect(fetchMarkets('inr', fakeFetch)).rejects.toBeInstanceOf(RateLimitedError);
  });
  it('parses a good response through fetchMarkets', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify([{ id: 'bitcoin', name: 'Bitcoin', current_price: 7004743 }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const coins = await fetchMarkets('inr', fakeFetch);
    expect(coins).toHaveLength(1);
    expect(coins[0].current_price).toBe(7004743);
  });
});
