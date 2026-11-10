import { describe, expect, it } from 'vitest';
import { sparklinePath, sparklineStats, sparklineSvg } from '../src/sparkline';

describe('sparklineStats', () => {
  it('finds min/max/first/last on the snapshot BTC sparkline shape', () => {
    const stats = sparklineStats([73828.47, 77020.97, 80668.65, 75003.04]);
    expect(stats).not.toBeNull();
    expect(stats!.min).toBe(73828.47);
    expect(stats!.max).toBe(80668.65);
    expect(stats!.first).toBe(73828.47);
    expect(stats!.last).toBe(75003.04);
    expect(stats!.changePct).toBeCloseTo(1.591, 2);
  });
  it('returns null for an empty array', () => {
    expect(sparklineStats([])).toBeNull();
  });
  it('handles a flat series (stablecoins)', () => {
    const stats = sparklineStats([1, 1, 1, 1]);
    expect(stats).not.toBeNull();
    expect(stats!.min).toBe(1);
    expect(stats!.max).toBe(1);
    expect(stats!.changePct).toBe(0);
  });
});

describe('sparklinePath', () => {
  it('produces a move + line path with one point per price', () => {
    const path = sparklinePath([10, 20, 15], 120, 36);
    expect(path.startsWith('M ')).toBe(true);
    expect(path.split(' L ').length).toBe(3);
  });
  it('returns an empty path for fewer than two points', () => {
    expect(sparklinePath([])).toBe('');
    expect(sparklinePath([42])).toBe('');
  });
  it('draws a flat series as a horizontal line at mid-height', () => {
    const path = sparklinePath([1, 1, 1], 120, 36);
    const ys = path
      .split(' L ')
      .map((seg) => seg.replace(/^M /, '').split(',')[1]);
    expect(new Set(ys).size).toBe(1);
    expect(Number(ys[0])).toBeCloseTo(18, 0);
  });
  it('puts the highest price at the top of the box', () => {
    const path = sparklinePath([10, 30, 20], 120, 36);
    const ys = path
      .split(' L ')
      .map((seg) => Number(seg.replace(/^M /, '').split(',')[1]));
    expect(ys[1]).toBeLessThan(ys[0]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

describe('sparklineSvg', () => {
  it('colours a rising series green and a falling one red', () => {
    expect(sparklineSvg([1, 2, 3])).toContain('stroke="#15803d"');
    expect(sparklineSvg([3, 2, 1])).toContain('stroke="#dc2626"');
  });
  it('returns an empty svg for no data', () => {
    expect(sparklineSvg([])).toContain('spark-empty');
    expect(sparklineSvg([])).not.toContain('<path');
  });
});
