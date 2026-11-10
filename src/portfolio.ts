/**
 * Portfolio maths — pure functions, no DOM, no network.
 *
 * A holding is a coin + how much of it you own + what you paid per coin
 * (in the display currency). Values are always computed from the *live*
 * price map; nothing here invents a price.
 *
 * Tax: India taxes gains on virtual digital assets (VDAs) at a flat 30%
 * (plus applicable surcharge/cess, which this estimate does not model).
 * The figure shown is an ESTIMATE on the current unrealised gain — not tax
 * advice, and it ignores losses elsewhere, fees, and TDS.
 */

export interface Holding {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  /** Amount of the coin held, e.g. 0.5 BTC. */
  amount: number;
  /** Price paid per coin, in the display currency at the time of entry. */
  buyPrice: number;
}

export interface HoldingRow extends Holding {
  invested: number;
  currentValue: number;
  gain: number;
  gainPct: number;
  /** True when no live price was available for this coin. */
  unpriced: boolean;
}

export interface PortfolioSummary {
  holdings: HoldingRow[];
  invested: number;
  currentValue: number;
  gain: number;
  gainPct: number;
  /** 30% of the gain, only when the gain is positive; 0 otherwise. */
  taxEstimate: number;
  unpricedCount: number;
}

export const TAX_RATE_VDA = 0.3;

export function holdingInvested(holding: Holding): number {
  return holding.amount * holding.buyPrice;
}

export function holdingValue(holding: Holding, livePrice: number | undefined): number {
  return livePrice === undefined ? 0 : holding.amount * livePrice;
}

/** 30% flat VDA tax on a positive gain; 0 on a loss or a flat position. */
export function estimateVdaTax(gain: number): number {
  return gain > 0 ? gain * TAX_RATE_VDA : 0;
}

export function summarizePortfolio(
  holdings: Holding[],
  prices: ReadonlyMap<string, number>,
): PortfolioSummary {
  const rows: HoldingRow[] = holdings.map((holding) => {
    const livePrice = prices.get(holding.coinId);
    const invested = holdingInvested(holding);
    const currentValue = holdingValue(holding, livePrice);
    const gain = currentValue - invested;
    return {
      ...holding,
      invested,
      currentValue,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : 0,
      unpriced: livePrice === undefined,
    };
  });
  const invested = rows.reduce((sum, row) => sum + row.invested, 0);
  const currentValue = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const gain = currentValue - invested;
  return {
    holdings: rows,
    invested,
    currentValue,
    gain,
    gainPct: invested > 0 ? (gain / invested) * 100 : 0,
    taxEstimate: estimateVdaTax(gain),
    unpricedCount: rows.filter((row) => row.unpriced).length,
  };
}

const STORAGE_KEY = 'coinwatch:portfolio:v1';

export function loadHoldings(storage: Storage | null = defaultStorage()): Holding[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Holding => {
      if (typeof entry !== 'object' || entry === null) return false;
      const e = entry as Record<string, unknown>;
      return (
        typeof e.id === 'string' &&
        typeof e.coinId === 'string' &&
        typeof e.symbol === 'string' &&
        typeof e.name === 'string' &&
        typeof e.amount === 'number' &&
        Number.isFinite(e.amount) &&
        e.amount >= 0 &&
        typeof e.buyPrice === 'number' &&
        Number.isFinite(e.buyPrice) &&
        e.buyPrice >= 0
      );
    });
  } catch {
    return [];
  }
}

export function saveHoldings(holdings: Holding[], storage: Storage | null = defaultStorage()): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // Storage full or unavailable (private mode) — the app keeps working
    // in-memory for this session.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
