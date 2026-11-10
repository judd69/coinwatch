/**
 * 7-day sparkline helpers — pure functions over a price array.
 *
 * The path is drawn with `pathLength="1"` so CSS can animate the draw with
 * `stroke-dasharray: 1; stroke-dashoffset: 1 -> 0` (see style.css `.spark`).
 * Empty or single-point input is safe: stats return null, the path is ''.
 */

export interface SparklineStats {
  min: number;
  max: number;
  first: number;
  last: number;
  /** Percentage change from first to last point. */
  changePct: number;
}

export function sparklineStats(prices: readonly number[]): SparklineStats | null {
  const finite = prices.filter((p) => Number.isFinite(p));
  if (finite.length === 0) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const first = finite[0];
  const last = finite[finite.length - 1];
  return {
    min,
    max,
    first,
    last,
    changePct: first !== 0 ? ((last - first) / first) * 100 : 0,
  };
}

/**
 * SVG path for the price series inside a `width × height` viewBox.
 * Returns '' when there are fewer than two points.
 */
export function sparklinePath(
  prices: readonly number[],
  width = 120,
  height = 36,
  pad = 2,
): string {
  const finite = prices.filter((p) => Number.isFinite(p));
  if (finite.length < 2) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = finite.map((price, i) => {
    const x = pad + (i / (finite.length - 1)) * innerW;
    const y = range === 0 ? pad + innerH / 2 : pad + (1 - (price - min) / range) * innerH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(' L ')}`;
}

/** Full inline SVG for a sparkline, coloured by its own 7d direction. */
export function sparklineSvg(prices: readonly number[], width = 120, height = 36): string {
  const path = sparklinePath(prices, width, height);
  if (path === '') {
    return `<svg class="spark spark-empty" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  }
  const stats = sparklineStats(prices);
  const up = stats !== null && stats.changePct >= 0;
  const stroke = up ? '#15803d' : '#dc2626';
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${path}" pathLength="1" fill="none" stroke="${stroke}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
