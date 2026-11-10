import { describe, expect, it } from 'vitest';
import {
  acknowledgeAlert,
  createAlert,
  deleteAlert,
  evaluateAlerts,
  isBeyondTarget,
  type PriceAlert,
} from '../src/alerts';

const btc = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' };

function alertAbove(target: number): PriceAlert {
  return createAlert(btc, 'above', target);
}
function alertBelow(target: number): PriceAlert {
  return createAlert(btc, 'below', target);
}

describe('isBeyondTarget', () => {
  it('above fires at or over the target', () => {
    expect(isBeyondTarget('above', 7004743, 7000000)).toBe(true);
    expect(isBeyondTarget('above', 7000000, 7000000)).toBe(true);
    expect(isBeyondTarget('above', 6999999, 7000000)).toBe(false);
  });
  it('below fires at or under the target', () => {
    expect(isBeyondTarget('below', 6900000, 6900000)).toBe(true);
    expect(isBeyondTarget('below', 6899999, 6900000)).toBe(true);
    expect(isBeyondTarget('below', 6900001, 6900000)).toBe(false);
  });
});

describe('evaluateAlerts', () => {
  it('triggers an above alert when the snapshot BTC price crosses ₹70,00,000', () => {
    const { alerts, newlyTriggered } = evaluateAlerts(
      [alertAbove(7000000)],
      new Map([['bitcoin', 7004743]]),
    );
    expect(newlyTriggered).toHaveLength(1);
    expect(alerts[0].triggered).toBe(true);
    expect(alerts[0].armed).toBe(false);
  });
  it('does not trigger when the price is on the safe side', () => {
    const { newlyTriggered } = evaluateAlerts(
      [alertAbove(7100000), alertBelow(6900000)],
      new Map([['bitcoin', 7004743]]),
    );
    expect(newlyTriggered).toHaveLength(0);
  });
  it('triggers a below alert when the price falls under the target', () => {
    const { newlyTriggered } = evaluateAlerts(
      [alertBelow(7100000)],
      new Map([['bitcoin', 7004743]]),
    );
    expect(newlyTriggered).toHaveLength(1);
  });
  it('does not re-trigger on the next refresh while the price stays beyond the target', () => {
    const first = evaluateAlerts([alertAbove(7000000)], new Map([['bitcoin', 7004743]]));
    expect(first.newlyTriggered).toHaveLength(1);
    const second = evaluateAlerts(first.alerts, new Map([['bitcoin', 7100000]]));
    expect(second.newlyTriggered).toHaveLength(0);
    expect(second.alerts[0].triggered).toBe(true);
  });
  it('re-arms only after the price moves back, then fires again on the next crossing', () => {
    const fired = evaluateAlerts([alertAbove(7000000)], new Map([['bitcoin', 7004743]])).alerts;
    // Price falls back below the target → re-armed, still showing triggered.
    const rearmed = evaluateAlerts(fired, new Map([['bitcoin', 6900000]]));
    expect(rearmed.newlyTriggered).toHaveLength(0);
    expect(rearmed.alerts[0].armed).toBe(true);
    // Acknowledge, then cross again → fires a second time.
    const acked = acknowledgeAlert(rearmed.alerts, rearmed.alerts[0].id);
    expect(acked[0].triggered).toBe(false);
    const refired = evaluateAlerts(acked, new Map([['bitcoin', 7050000]]));
    expect(refired.newlyTriggered).toHaveLength(1);
  });
  it('ignores alerts for coins with no live price', () => {
    const { newlyTriggered } = evaluateAlerts([alertAbove(100)], new Map());
    expect(newlyTriggered).toHaveLength(0);
  });
  it('does not mutate the input list', () => {
    const input = [alertAbove(7000000)];
    const before = input[0].triggered;
    evaluateAlerts(input, new Map([['bitcoin', 7004743]]));
    expect(input[0].triggered).toBe(before);
  });
});

describe('acknowledgeAlert / deleteAlert', () => {
  it('acknowledging clears the triggered flag but keeps the alert', () => {
    const fired = evaluateAlerts([alertAbove(7000000)], new Map([['bitcoin', 7004743]])).alerts;
    const acked = acknowledgeAlert(fired, fired[0].id);
    expect(acked).toHaveLength(1);
    expect(acked[0].triggered).toBe(false);
  });
  it('deleting removes only that alert', () => {
    const list = [alertAbove(7000000), alertBelow(6000000)];
    const kept = deleteAlert(list, list[0].id);
    expect(kept).toHaveLength(1);
    expect(kept[0].direction).toBe('below');
  });
});
