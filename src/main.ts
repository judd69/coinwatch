import {
  fetchMarkets,
  NetworkError,
  RateLimitedError,
  type Coin,
  type Currency,
} from './api';
import { acknowledgeAlert, createAlert, deleteAlert, evaluateAlerts, loadAlerts, saveAlerts, type PriceAlert } from './alerts';
import { formatClockTime, formatCompact, formatMoney, formatPct, formatPrice, formatRelativeTime } from './format';
import { loadHoldings, saveHoldings, summarizePortfolio, type Holding } from './portfolio';
import { sparklineStats, sparklineSvg } from './sparkline';
import './style.css';

const REFRESH_SECONDS = 60;
const WATCHLIST_KEY = 'coinwatch:watchlist:v1';

type Filter = 'all' | 'gainers' | 'losers' | 'watchlist';
type Sort = 'mcap' | 'gainers' | 'losers' | 'name';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing element #${id}`);
  return el;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** CoinGecko's sparkline array is USD-denominated whatever the vs_currency
 *  is; convert it to the display currency through the implied rate
 *  (current price ÷ last sparkline point). Shape is unaffected. */
function sparklineInDisplayCurrency(coin: Coin): number[] {
  const spark = coin.sparkline_in_7d.price;
  if (spark.length === 0) return [];
  const last = spark[spark.length - 1];
  if (last <= 0) return spark;
  const rate = coin.current_price / last;
  return spark.map((p) => p * rate);
}

function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveWatchlist(watchlist: Set<string>): void {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...watchlist]));
  } catch {
    // Private mode / full storage — watchlist still works for this session.
  }
}

class CoinWatchApp {
  private coins: Coin[] = [];
  private currency: Currency = 'inr';
  private query = '';
  private filter: Filter = 'all';
  private sort: Sort = 'mcap';
  private watchlist = loadWatchlist();
  private holdings: Holding[] = loadHoldings();
  private alerts: PriceAlert[] = loadAlerts();
  private selectedCoinId: string | null = null;
  private lastUpdated: Date | null = null;
  private countdown = REFRESH_SECONDS;
  private refreshing = false;
  private errorMessage: string | null = null;

  constructor() {
    const param = new URLSearchParams(window.location.search).get('currency');
    if (param === 'usd' || param === 'inr') this.currency = param;
  }

  init(): void {
    this.wireControls();
    this.renderStatic();
    void this.refresh(false);
    window.setInterval(() => this.tick(), 1000);
  }

  // ---------- wiring ----------

  private wireControls(): void {
    ($('cur-inr') as HTMLButtonElement).addEventListener('click', () => this.setCurrency('inr'));
    ($('cur-usd') as HTMLButtonElement).addEventListener('click', () => this.setCurrency('usd'));
    ($('refresh-btn') as HTMLButtonElement).addEventListener('click', () => void this.refresh(true));

    ($('search-input') as HTMLInputElement).addEventListener('input', (event) => {
      this.query = (event.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderTable();
    });
    ($('sort-select') as HTMLSelectElement).addEventListener('change', (event) => {
      this.sort = (event.target as HTMLSelectElement).value as Sort;
      this.renderTable();
    });
    document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.filter = chip.dataset.filter as Filter;
        document.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
          c.classList.toggle('active', c === chip);
        });
        this.renderTable();
      });
    });

    ($('holding-form') as HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault();
      this.addHolding();
    });
    ($('alert-form') as HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault();
      this.addAlert();
    });
    ($('detail-close') as HTMLButtonElement).addEventListener('click', () => {
      this.selectedCoinId = null;
      this.renderTable();
      this.renderDetail();
    });
    ($('holdings-list') as HTMLElement).addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-remove-holding]');
      if (button === null) return;
      const id = button.dataset.removeHolding;
      this.holdings = this.holdings.filter((h) => h.id !== id);
      saveHoldings(this.holdings);
      this.renderPortfolio();
    });
    ($('alerts-list') as HTMLElement).addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const ack = target.closest<HTMLButtonElement>('[data-ack-alert]');
      if (ack !== null) {
        this.alerts = acknowledgeAlert(this.alerts, ack.dataset.ackAlert ?? '');
        saveAlerts(this.alerts);
        this.renderAlerts();
        this.renderAlertBanner();
        return;
      }
      const del = target.closest<HTMLButtonElement>('[data-del-alert]');
      if (del !== null) {
        this.alerts = deleteAlert(this.alerts, del.dataset.delAlert ?? '');
        saveAlerts(this.alerts);
        this.renderAlerts();
        this.renderAlertBanner();
      }
    });
    ($('alert-banner') as HTMLElement).addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const ack = target.closest<HTMLButtonElement>('[data-ack-alert]');
      if (ack === null) return;
      this.alerts = acknowledgeAlert(this.alerts, ack.dataset.ackAlert ?? '');
      saveAlerts(this.alerts);
      this.renderAlerts();
      this.renderAlertBanner();
    });
    ($('market-body') as HTMLElement).addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const star = target.closest<HTMLButtonElement>('.star');
      if (star !== null) {
        const id = star.dataset.coinId ?? '';
        if (this.watchlist.has(id)) this.watchlist.delete(id);
        else this.watchlist.add(id);
        saveWatchlist(this.watchlist);
        this.renderTable();
        return;
      }
      const row = target.closest<HTMLTableRowElement>('tr[data-coin-id]');
      if (row !== null) {
        this.selectedCoinId = row.dataset.coinId ?? null;
        this.renderTable();
        this.renderDetail();
      }
    });
  }

  // ---------- data ----------

  private async refresh(manual: boolean): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    this.setStatus(manual ? 'Refreshing…' : 'Refreshing…');
    try {
      const coins = await fetchMarkets(this.currency);
      this.coins = coins;
      this.lastUpdated = new Date();
      this.errorMessage = null;
      this.countdown = REFRESH_SECONDS;
      this.checkAlerts();
      this.renderAll();
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof NetworkError) {
        this.errorMessage = error.message;
      } else {
        this.errorMessage = 'Something went wrong fetching prices. Your last good prices are still shown.';
      }
      this.countdown = REFRESH_SECONDS;
      this.renderError();
      this.setStatus(this.lastUpdated === null ? 'Could not load prices.' : 'Refresh failed — showing last good data.');
    } finally {
      this.refreshing = false;
    }
  }

  private tick(): void {
    if (this.countdown > 0) this.countdown -= 1;
    if (this.countdown <= 0) {
      void this.refresh(false);
      return;
    }
    this.setStatus(`Next refresh in ${this.countdown}s`);
    this.renderLastUpdated();
  }

  private setStatus(text: string): void {
    $('refresh-status').textContent = text;
  }

  private checkAlerts(): void {
    if (this.alerts.length === 0) return;
    const prices = new Map(this.coins.map((c) => [c.id, c.current_price]));
    const result = evaluateAlerts(this.alerts, prices);
    this.alerts = result.alerts;
    if (result.newlyTriggered.length > 0) saveAlerts(this.alerts);
  }

  private setCurrency(currency: Currency): void {
    if (currency === this.currency) return;
    this.currency = currency;
    $('cur-inr').classList.toggle('active', currency === 'inr');
    $('cur-usd').classList.toggle('active', currency === 'usd');
    const url = new URL(window.location.href);
    url.searchParams.set('currency', currency);
    window.history.replaceState(null, '', url);
    void this.refresh(true);
  }

  // ---------- forms ----------

  private resolveCoin(input: string): Coin | undefined {
    const needle = input.trim().toLowerCase();
    if (needle === '') return undefined;
    return (
      this.coins.find((c) => c.id.toLowerCase() === needle) ??
      this.coins.find((c) => c.symbol.toLowerCase() === needle) ??
      this.coins.find((c) => c.name.toLowerCase() === needle) ??
      this.coins.find((c) => c.name.toLowerCase().startsWith(needle))
    );
  }

  private addHolding(): void {
    const coinInput = $('holding-coin') as HTMLInputElement;
    const amountInput = $('holding-amount') as HTMLInputElement;
    const buyInput = $('holding-buyprice') as HTMLInputElement;
    const coin = this.resolveCoin(coinInput.value);
    const amount = Number(amountInput.value);
    const buyPrice = Number(buyInput.value);
    if (coin === undefined) {
      window.alert('Pick a coin from the list first — prices need a live coin to value against.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(buyPrice) || buyPrice < 0) {
      window.alert('Enter an amount above 0 and a buy price of 0 or more.');
      return;
    }
    const holding: Holding = {
      id: `h-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      coinId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      amount,
      buyPrice,
    };
    this.holdings = [...this.holdings, holding];
    saveHoldings(this.holdings);
    coinInput.value = '';
    amountInput.value = '';
    buyInput.value = '';
    this.renderPortfolio();
  }

  private addAlert(): void {
    const coinInput = $('alert-coin') as HTMLInputElement;
    const directionInput = $('alert-direction') as HTMLSelectElement;
    const targetInput = $('alert-target') as HTMLInputElement;
    const coin = this.resolveCoin(coinInput.value);
    const target = Number(targetInput.value);
    if (coin === undefined) {
      window.alert('Pick a coin from the list first.');
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      window.alert('Enter a target price above 0.');
      return;
    }
    this.alerts = [...this.alerts, createAlert(coin, directionInput.value === 'below' ? 'below' : 'above', target)];
    saveAlerts(this.alerts);
    coinInput.value = '';
    targetInput.value = '';
    this.renderAlerts();
    this.renderAlertBanner();
  }

  // ---------- rendering ----------

  private renderStatic(): void {
    $('cur-inr').classList.toggle('active', this.currency === 'inr');
    $('cur-usd').classList.toggle('active', this.currency === 'usd');
    this.renderPortfolio();
    this.renderAlerts();
  }

  private renderAll(): void {
    this.renderTable();
    this.renderDetail();
    this.renderPortfolio();
    this.renderAlerts();
    this.renderAlertBanner();
    this.renderError();
    this.renderLastUpdated();
    this.setStatus(`Next refresh in ${this.countdown}s`);
  }

  private priceMap(): Map<string, number> {
    return new Map(this.coins.map((c) => [c.id, c.current_price]));
  }

  private renderPortfolio(): void {
    const summary = summarizePortfolio(this.holdings, this.priceMap());
    const totalEl = $('portfolio-total');
    const previous = totalEl.textContent;
    const totalText = this.holdings.length === 0 ? '—' : formatMoney(summary.currentValue, this.currency);
    totalEl.textContent = totalText;
    // Morph the total in place on refresh instead of letting it jump.
    if (previous !== null && previous !== totalText && previous !== '—') {
      totalEl.classList.remove('morph');
      void totalEl.offsetWidth;
      totalEl.classList.add('morph');
    }
    const gainEl = $('portfolio-gain');
    if (this.holdings.length === 0) {
      gainEl.textContent = 'No holdings yet — add one below.';
      gainEl.className = 'total-gain muted';
    } else {
      const sign = summary.gain >= 0 ? '+' : '';
      gainEl.textContent = `${sign}${formatMoney(summary.gain, this.currency)} (${sign}${summary.gainPct.toFixed(2)}%)`;
      gainEl.className = `total-gain pct ${summary.gain > 0 ? 'up' : summary.gain < 0 ? 'down' : 'flat'}`;
    }

    const stats = $('portfolio-stats');
    stats.innerHTML = [
      ['Invested', formatMoney(summary.invested, this.currency)],
      ['Current value', formatMoney(summary.currentValue, this.currency)],
      [
        'Gain / loss',
        `${summary.gain >= 0 ? '+' : ''}${formatMoney(summary.gain, this.currency)} (${summary.gainPct >= 0 ? '+' : ''}${summary.gainPct.toFixed(2)}%)`,
      ],
      ['Est. VDA tax (30% of gain)', summary.taxEstimate > 0 ? formatMoney(summary.taxEstimate, this.currency) : '—'],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-value">${escapeHtml(value)}</span></div>`,
      )
      .join('');

    const list = $('holdings-list');
    if (summary.holdings.length === 0) {
      list.innerHTML = '<p class="empty-note">Nothing held yet. Try 0.5 BTC — the form values it live.</p>';
      return;
    }
    list.innerHTML = summary.holdings
      .map((row) => {
        const sign = row.gain >= 0 ? '+' : '';
        const valueText = row.unpriced
          ? 'No live price yet — value shown after the next refresh.'
          : `${formatMoney(row.currentValue, this.currency)} · ${sign}${formatMoney(row.gain, this.currency)} (${sign}${row.gainPct.toFixed(2)}%)`;
        return `<div class="holding-row">
          <span><strong>${escapeHtml(row.name)}</strong> <span class="muted">${escapeHtml(row.symbol.toUpperCase())} · ${row.amount} @ ${formatPrice(row.buyPrice, this.currency)}</span></span>
          <span>${escapeHtml(valueText)}</span>
          <button class="btn ghost small" type="button" data-remove-holding="${escapeHtml(row.id)}">Remove</button>
        </div>`;
      })
      .join('');
  }

  private filteredCoins(): Coin[] {
    let list = [...this.coins];
    if (this.query !== '') {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(this.query) || c.symbol.toLowerCase().includes(this.query),
      );
    }
    if (this.filter === 'gainers') {
      list = list.filter((c) => (c.price_change_percentage_24h ?? 0) > 0);
    } else if (this.filter === 'losers') {
      list = list.filter((c) => (c.price_change_percentage_24h ?? 0) < 0);
    } else if (this.filter === 'watchlist') {
      list = list.filter((c) => this.watchlist.has(c.id));
    }
    switch (this.sort) {
      case 'mcap':
        list.sort((a, b) => (a.market_cap_rank || 9999) - (b.market_cap_rank || 9999));
        break;
      case 'gainers':
        list.sort((a, b) => (b.price_change_percentage_24h ?? -Infinity) - (a.price_change_percentage_24h ?? -Infinity));
        break;
      case 'losers':
        list.sort((a, b) => (a.price_change_percentage_24h ?? Infinity) - (b.price_change_percentage_24h ?? Infinity));
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return list;
  }

  private renderTable(): void {
    const body = $('market-body') as HTMLTableSectionElement;
    const datalist = $('coin-list') as HTMLDataListElement;
    datalist.innerHTML = this.coins
      .map((c) => `<option value="${escapeHtml(c.name)} (${escapeHtml(c.symbol.toUpperCase())})"></option>`)
      .join('');

    if (this.coins.length === 0) {
      body.innerHTML =
        '<tr><td colspan="8" class="loading-cell">No prices yet — if CoinGecko is unreachable the page will say so here.</td></tr>';
      return;
    }
    const list = this.filteredCoins();
    $('market-empty').hidden = list.length !== 0;
    body.innerHTML = list
      .map((coin) => {
        const change = coin.price_change_percentage_24h;
        const changeClass = change === null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
        const starred = this.watchlist.has(coin.id);
        return `<tr data-coin-id="${escapeHtml(coin.id)}" class="${this.selectedCoinId === coin.id ? 'selected' : ''}">
          <td><button class="star ${starred ? 'active' : ''}" type="button" data-coin-id="${escapeHtml(coin.id)}" aria-label="${starred ? 'Remove from' : 'Add to'} watchlist: ${escapeHtml(coin.name)}">${starred ? '★' : '☆'}</button></td>
          <td>${coin.market_cap_rank || '—'}</td>
          <td><span class="coin-cell">${coin.image !== '' ? `<img src="${escapeHtml(coin.image)}" alt="" loading="lazy" />` : ''}<span>${escapeHtml(coin.name)} <span class="sym">${escapeHtml(coin.symbol.toUpperCase())}</span></span></span></td>
          <td class="num">${formatPrice(coin.current_price, this.currency)}</td>
          <td class="num pct ${changeClass}">${formatPct(change)}</td>
          <td>${sparklineSvg(sparklineInDisplayCurrency(coin))}</td>
          <td class="num">${formatCompact(coin.market_cap, this.currency)}</td>
          <td class="num">${formatCompact(coin.total_volume, this.currency)}</td>
        </tr>`;
      })
      .join('');
  }

  private renderDetail(): void {
    const panel = $('detail-panel');
    const coin = this.coins.find((c) => c.id === this.selectedCoinId);
    if (coin === undefined) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    $('detail-name').textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
    const spark = sparklineInDisplayCurrency(coin);
    const stats = sparklineStats(spark);
    const rows: Array<[string, string]> = [
      ['Price', formatPrice(coin.current_price, this.currency)],
      ['24h change', formatPct(coin.price_change_percentage_24h)],
      ['24h high / low', coin.high_24h !== null && coin.low_24h !== null ? `${formatPrice(coin.high_24h, this.currency)} / ${formatPrice(coin.low_24h, this.currency)}` : '—'],
      ['7d high / low', stats !== null ? `${formatPrice(stats.max, this.currency)} / ${formatPrice(stats.min, this.currency)}` : '—'],
      ['All-time high', coin.ath !== null ? `${formatPrice(coin.ath, this.currency)} (${formatPct(coin.ath_change_percentage)})` : '—'],
      ['Market cap', formatCompact(coin.market_cap, this.currency)],
      ['24h volume', formatCompact(coin.total_volume, this.currency)],
      ['Rank', coin.market_cap_rank > 0 ? `#${coin.market_cap_rank}` : '—'],
    ];
    $('detail-body').innerHTML =
      rows
        .map(([k, v]) => `<div class="detail-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`)
        .join('') +
      `<div class="detail-row"><span class="k">CoinGecko page</span><span class="v"><a href="https://www.coingecko.com/en/coins/${escapeHtml(coin.id)}" target="_blank" rel="noopener">View coin ↗</a></span></div>
       <p class="muted" style="font-size:0.82rem;margin:0.6rem 0 0;">7d range is read off the sparkline, converted from USD at the implied rate — an approximation, not an exchange quote.</p>`;
  }

  private renderAlerts(): void {
    const badge = $('alert-count');
    const triggered = this.alerts.filter((a) => a.triggered).length;
    badge.hidden = this.alerts.length === 0;
    badge.textContent = this.alerts.length === 0 ? '' : triggered > 0 ? `${triggered} triggered` : `${this.alerts.length} active`;
    badge.classList.toggle('triggered', triggered > 0);

    const list = $('alerts-list');
    if (this.alerts.length === 0) {
      list.innerHTML = '<p class="empty-note">No alerts yet. Add one — e.g. Bitcoin above ₹75,00,000.</p>';
      return;
    }
    list.innerHTML = this.alerts
      .map((alert) => {
        const coin = this.coins.find((c) => c.id === alert.coinId);
        const live = coin === undefined ? null : formatPrice(coin.current_price, this.currency);
        return `<div class="alert-row ${alert.triggered ? 'triggered' : ''}">
          <span class="alert-text">${escapeHtml(alert.name)} ${alert.direction} ${formatPrice(alert.target, this.currency)}</span>
          <span class="alert-meta">${live === null ? 'No live price yet' : `Now ${live}`} · ${alert.triggered ? 'Triggered — acknowledge to clear' : alert.armed ? 'Watching' : 'Waiting for price to move back'}</span>
          <span class="alert-actions">
            ${alert.triggered ? `<button class="btn small" type="button" data-ack-alert="${escapeHtml(alert.id)}">Acknowledge</button>` : ''}
            <button class="btn ghost small" type="button" data-del-alert="${escapeHtml(alert.id)}">Delete</button>
          </span>
        </div>`;
      })
      .join('');
  }

  private renderAlertBanner(): void {
    const banner = $('alert-banner');
    const triggered = this.alerts.filter((a) => a.triggered);
    if (triggered.length === 0) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    banner.innerHTML = triggered
      .map((alert) => {
        const coin = this.coins.find((c) => c.id === alert.coinId);
        const live = coin === undefined ? '' : ` — now ${formatPrice(coin.current_price, this.currency)}`;
        return `<div class="alert-item"><span><strong>🔔 ${escapeHtml(alert.name)}</strong> went ${alert.direction} ${formatPrice(alert.target, this.currency)}${escapeHtml(live)}.</span><button class="btn small" type="button" data-ack-alert="${escapeHtml(alert.id)}">Acknowledge</button></div>`;
      })
      .join('');
  }

  private renderError(): void {
    const banner = $('error-banner');
    if (this.errorMessage === null) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    const suffix =
      this.coins.length > 0
        ? ' Showing the last good prices below.'
        : ' No prices to show yet — CoinWatch never shows invented prices.';
    banner.innerHTML = `<p><strong>Couldn’t refresh prices.</strong> ${escapeHtml(this.errorMessage)}${escapeHtml(suffix)}</p>`;
  }

  private renderLastUpdated(): void {
    const el = $('last-updated');
    if (this.lastUpdated === null) {
      el.textContent = this.errorMessage === null ? 'Loading live prices…' : 'Prices not loaded yet.';
      return;
    }
    el.textContent = `Last updated ${formatClockTime(this.lastUpdated)} (${formatRelativeTime(this.lastUpdated)}) · auto-refresh every 60s`;
  }
}

new CoinWatchApp().init();
