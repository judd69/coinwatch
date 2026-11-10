import { describe, expect, it } from 'vitest';
import { formatCompact, formatGrouped, formatMoney, formatPct, formatPrice, formatRelativeTime } from '../src/format';

describe('formatGrouped — Indian digit grouping', () => {
  it('groups 70,04,743 the Indian way (snapshot BTC price)', () => {
    expect(formatGrouped(7004743)).toBe('70,04,743');
  });
  it('groups a lakh figure', () => {
    expect(formatGrouped(198424)).toBe('1,98,424');
  });
  it('groups thousands', () => {
    expect(formatGrouped(64431)).toBe('64,431');
  });
  it('leaves small numbers alone', () => {
    expect(formatGrouped(93)).toBe('93');
  });
});

describe('formatPrice — adaptive precision', () => {
  it('shows 2 decimals for large INR prices', () => {
    expect(formatPrice(7004743, 'inr')).toBe('₹70,04,743.00');
  });
  it('shows 2 decimals for a ₹6.52 coin', () => {
    expect(formatPrice(6.52, 'inr')).toBe('₹6.52');
  });
  it('shows 4 decimals below ₹1', () => {
    expect(formatPrice(0.5, 'inr')).toBe('₹0.5000');
  });
  it('formats USD with US grouping', () => {
    expect(formatPrice(75003.04, 'usd')).toBe('$75,003.04');
  });
});

describe('formatMoney — whole figures', () => {
  it('formats the snapshot BTC value with Indian grouping', () => {
    expect(formatMoney(3502372, 'inr')).toBe('₹35,02,372');
  });
});

describe('formatCompact — lakh / crore', () => {
  it('formats the snapshot BTC market cap as lakh crore', () => {
    // BTC mcap in the 2026-11-10 snapshot: ₹1,40,86,59,27,90,1263 → 140.87 lakh cr
    expect(formatCompact(140865927901263, 'inr')).toBe('₹140.87 lakh cr');
  });
  it('formats the top-20 total market cap as lakh crore', () => {
    expect(formatCompact(223662222335733, 'inr')).toBe('₹223.66 lakh cr');
  });
  it('formats a lakh-crore-scale figure', () => {
    // BNB mcap in the snapshot: ₹8,473,381,714,442 → 8.47 lakh crore
    expect(formatCompact(8473381714442, 'inr')).toBe('₹8.47 lakh cr');
  });
  it('formats a crore-scale figure with Indian grouping', () => {
    // Cardano mcap in the snapshot: ₹6,22,22,82,91,884 → 62,223 crore
    expect(formatCompact(622228291884, 'inr')).toBe('₹62,223 cr');
  });
  it('formats a lakh-scale figure', () => {
    expect(formatCompact(250000, 'inr')).toBe('₹2.50 lakh');
  });
  it('formats USD compactly', () => {
    expect(formatCompact(2500000000, 'usd')).toBe('$2.50B');
  });
});

describe('formatPct', () => {
  it('signs a positive change', () => {
    expect(formatPct(1.234)).toBe('+1.23%');
  });
  it('shows the snapshot BTC 24h change', () => {
    expect(formatPct(-1.10029)).toBe('-1.10%');
  });
  it('shows an em dash for a null change (e.g. figure-heloc in the snapshot)', () => {
    expect(formatPct(null)).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  it('says just now under a minute', () => {
    const now = new Date('2026-11-10T08:05:00+05:30');
    expect(formatRelativeTime(new Date('2026-11-10T08:04:30+05:30'), now)).toBe('just now');
  });
  it('says minutes ago', () => {
    const now = new Date('2026-11-10T08:05:00+05:30');
    expect(formatRelativeTime(new Date('2026-11-10T08:00:00+05:30'), now)).toBe('5m ago');
  });
  it('says hours ago', () => {
    const now = new Date('2026-11-10T08:05:00+05:30');
    expect(formatRelativeTime(new Date('2026-11-10T06:05:00+05:30'), now)).toBe('2h ago');
  });
});
