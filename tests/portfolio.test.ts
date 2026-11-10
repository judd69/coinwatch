import { describe, expect, it } from 'vitest';
import {
  estimateVdaTax,
  holdingInvested,
  holdingValue,
  summarizePortfolio,
  type Holding,
} from '../src/portfolio';

const btcHolding: Holding = {
  id: 'h1',
  coinId: 'bitcoin',
  symbol: 'btc',
  name: 'Bitcoin',
  amount: 0.5,
  buyPrice: 6500000,
};

describe('holding maths', () => {
  it('values 0.5 BTC at the snapshot price (₹70,04,743)', () => {
    expect(holdingValue(btcHolding, 7004743)).toBeCloseTo(3502371.5, 6);
  });
  it('invested is amount × buy price', () => {
    expect(holdingInvested(btcHolding)).toBe(3250000);
  });
  it('unpriced holding is worth 0, not invented', () => {
    expect(holdingValue(btcHolding, undefined)).toBe(0);
  });
  it('zero amount is worth 0 and invested 0', () => {
    const zero: Holding = { ...btcHolding, amount: 0 };
    expect(holdingValue(zero, 7004743)).toBe(0);
    expect(holdingInvested(zero)).toBe(0);
  });
});

describe('summarizePortfolio — the README example, from the snapshot', () => {
  it('computes gain and tax for 0.5 BTC bought at ₹65,00,000', () => {
    const summary = summarizePortfolio([btcHolding], new Map([['bitcoin', 7004743]]));
    expect(summary.invested).toBe(3250000);
    expect(summary.currentValue).toBeCloseTo(3502371.5, 6);
    expect(summary.gain).toBeCloseTo(252371.5, 6);
    expect(summary.gainPct).toBeCloseTo(7.765, 2);
    // 30% flat VDA tax on the gain: 252371.5 × 0.30 = 75,711.45
    expect(summary.taxEstimate).toBeCloseTo(75711.45, 2);
    expect(summary.unpricedCount).toBe(0);
  });
  it('tax is 0 on a loss', () => {
    const summary = summarizePortfolio([btcHolding], new Map([['bitcoin', 6000000]]));
    expect(summary.gain).toBeLessThan(0);
    expect(summary.taxEstimate).toBe(0);
  });
  it('an empty portfolio is all zeros', () => {
    const summary = summarizePortfolio([], new Map());
    expect(summary.invested).toBe(0);
    expect(summary.currentValue).toBe(0);
    expect(summary.gain).toBe(0);
    expect(summary.gainPct).toBe(0);
    expect(summary.taxEstimate).toBe(0);
    expect(summary.holdings).toEqual([]);
  });
  it('a coin with no live price counts as unpriced, not as a loss', () => {
    const summary = summarizePortfolio([btcHolding], new Map());
    expect(summary.holdings[0].unpriced).toBe(true);
    expect(summary.currentValue).toBe(0);
    expect(summary.unpricedCount).toBe(1);
  });
});

describe('estimateVdaTax', () => {
  it('is 30% of a positive gain', () => {
    expect(estimateVdaTax(100000)).toBe(30000);
  });
  it('is 0 for zero or negative gains', () => {
    expect(estimateVdaTax(0)).toBe(0);
    expect(estimateVdaTax(-5000)).toBe(0);
  });
});
