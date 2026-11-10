/**
 * Price alerts — pure evaluation, no DOM, no network.
 *
 * An alert fires when the live price crosses its target: price >= target for
 * "above", price <= target for "below". Once fired it stays fired until
 * acknowledged, and it does NOT re-fire while the price stays beyond the
 * target: it re-arms only after the price moves back to the other side of
 * the target. That stops the banner from spamming on every 60s refresh.
 */

export type AlertDirection = 'above' | 'below';

export interface PriceAlert {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  direction: AlertDirection;
  target: number;
  createdAt: string;
  triggered: boolean;
  /** False while the price sits beyond the target after a trigger. */
  armed: boolean;
  triggeredAt: string | null;
}

export function createAlert(
  coin: { id: string; symbol: string; name: string },
  direction: AlertDirection,
  target: number,
): PriceAlert {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `alert-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return {
    id,
    coinId: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    direction,
    target,
    createdAt: new Date().toISOString(),
    triggered: false,
    armed: true,
    triggeredAt: null,
  };
}

/** True when `price` is on the trigger side of `target` for this direction. */
export function isBeyondTarget(direction: AlertDirection, price: number, target: number): boolean {
  return direction === 'above' ? price >= target : price <= target;
}

export interface EvaluationResult {
  alerts: PriceAlert[];
  newlyTriggered: PriceAlert[];
}

/**
 * Evaluate every alert against the current price map. Returns a new alert
 * list (never mutates the input) plus the alerts that fired on this pass.
 */
export function evaluateAlerts(
  alerts: PriceAlert[],
  prices: ReadonlyMap<string, number>,
  now: Date = new Date(),
): EvaluationResult {
  const newlyTriggered: PriceAlert[] = [];
  const next = alerts.map((alert) => {
    const price = prices.get(alert.coinId);
    if (price === undefined) return alert;
    const beyond = isBeyondTarget(alert.direction, price, alert.target);
    if (beyond && alert.armed && !alert.triggered) {
      const fired: PriceAlert = { ...alert, triggered: true, armed: false, triggeredAt: now.toISOString() };
      newlyTriggered.push(fired);
      return fired;
    }
    if (!beyond && !alert.armed) {
      // Price moved back across the target — re-arm for the next crossing.
      return { ...alert, armed: true };
    }
    return alert;
  });
  return { alerts: next, newlyTriggered };
}

/** Acknowledge a triggered alert: clears the banner, keeps the alert armed per its price. */
export function acknowledgeAlert(alerts: PriceAlert[], id: string): PriceAlert[] {
  return alerts.map((alert) =>
    alert.id === id ? { ...alert, triggered: false, triggeredAt: null } : alert,
  );
}

export function deleteAlert(alerts: PriceAlert[], id: string): PriceAlert[] {
  return alerts.filter((alert) => alert.id !== id);
}

const STORAGE_KEY = 'coinwatch:alerts:v1';

export function loadAlerts(storage: Storage | null = defaultStorage()): PriceAlert[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PriceAlert => {
      if (typeof entry !== 'object' || entry === null) return false;
      const e = entry as Record<string, unknown>;
      return (
        typeof e.id === 'string' &&
        typeof e.coinId === 'string' &&
        typeof e.symbol === 'string' &&
        typeof e.name === 'string' &&
        (e.direction === 'above' || e.direction === 'below') &&
        typeof e.target === 'number' &&
        Number.isFinite(e.target)
      );
    }).map((entry) => ({
      ...entry,
      triggered: entry.triggered === true,
      armed: entry.armed !== false,
      triggeredAt: typeof entry.triggeredAt === 'string' ? entry.triggeredAt : null,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[], storage: Storage | null = defaultStorage()): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Storage full or unavailable — the app keeps working in-memory.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
