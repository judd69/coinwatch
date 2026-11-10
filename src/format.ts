/**
 * Number / money / time formatting.
 *
 * Indian grouping throughout for rupees: 70,04,743 — not the Western
 * 7,004,743. Large rupee figures use the Indian units people actually say:
 * lakh (1,00,000) and crore (1,00,00,000), and lakh crore above ₹1,00,00,00,00,000.
 */

import type { Currency } from './api';

export function currencySymbol(currency: Currency): string {
  return currency === 'inr' ? '₹' : '$';
}

/** Plain en-IN digit grouping, e.g. 7004743 -> "70,04,743". */
export function formatGrouped(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

/**
 * A price with adaptive precision: 2 decimals for most coins, 4 below ₹1,
 * 6 below ₹0.01 (so a ₹0.0004 coin is not rounded to ₹0.00).
 */
export function formatPrice(value: number, currency: Currency): string {
  const locale = currency === 'inr' ? 'en-IN' : 'en-US';
  const fractionDigits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Whole-rupee money figure with Indian grouping, e.g. 3502372 -> "₹35,02,372". */
export function formatMoney(value: number, currency: Currency): string {
  const locale = currency === 'inr' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Compact large figures. INR: lakh / crore / lakh crore.
 *   140865927901263 -> "₹140.87 lakh cr"
 *   24248215823793  -> "₹24.25 lakh cr"
 *   8473381714442   -> "₹84,734 cr"  (84,734 crore)
 *   250000          -> "₹2.50 lakh"
 * USD: K / M / B.
 */
export function formatCompact(value: number, currency: Currency): string {
  const symbol = currencySymbol(currency);
  if (currency === 'inr') {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(2)} lakh cr`;
    if (abs >= 1e7) return `${sign}${symbol}${formatGrouped(Math.round(abs / 1e7))} cr`;
    if (abs >= 1e5) return `${sign}${symbol}${(abs / 1e5).toFixed(2)} lakh`;
    return formatMoney(value, currency);
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(2)}K`;
  return formatMoney(value, currency);
}

/** "+1.23%", "-1.10%", or "—" when the value is null (some coins report none). */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** "just now", "3m ago", "2h ago", "5d ago". */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "07:55:46" style clock time for the last-updated stamp. */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour12: false });
}
