# CoinWatch — what your crypto is worth in rupees, right now

Everyone quotes Bitcoin in dollars. CoinWatch prices the **top 100 coins by
market cap in rupees**, draws each coin's last 7 days, and answers the
personal question — *what is my holding worth today, and what would the
taxman roughly take from the gain?* No account, no sign-up, no invented
prices.

**Live demo:** https://judd69.github.io/coinwatch/
**Repo:** https://github.com/judd69/coinwatch

## The problem

Indians check "what is Bitcoin in rupees today" constantly, but the pages
that answer it are ad-heavy list pages — and none answers the personal
question without an account: *what is MY crypto worth in rupees right now?*
CoinWatch does, in the browser, with your data staying in your browser.

## What it does

- **Live top-100 table in ₹** — rank, price, 24h % (green/red), a 7-day
  sparkline per coin, market cap and 24h volume. INR/USD toggle refetches
  in the other currency.
- **Search, sort and quick chips** — filter by name/symbol; sort by market
  cap, biggest gainers, biggest losers, or name; one-tap Gainers / Losers /
  Watchlist chips.
- **Coin detail panel** — click any row: 24h high/low, all-time high and how
  far below it the coin sits, total volume, market cap, 7d high/low read off
  the sparkline, and a CoinGecko link.
- **Watchlist** — star coins; persisted in `localStorage`; a chip shows
  watchlist only.
- **Portfolio** — add a holding (coin + amount + buy price in ₹) and see its
  live ₹ value, total invested, total current value, gain/loss in ₹ and %,
  and an **estimated 30% flat VDA tax on the gain**. The tax figure is an
  estimate, clearly labelled — not tax advice. Holdings persist in
  `localStorage`; remove any holding with one tap.
- **Price alerts** — coin + above/below + target price, persisted in
  `localStorage`, evaluated on every refresh. Triggered alerts appear in a
  banner with a badge; acknowledge to clear. An alert never re-fires while
  the price stays past its target — it re-arms only after the price moves
  back across it.
- **Auto-refresh every 60s** with a visible countdown, a manual refresh
  button, and a "last updated" timestamp. **Rate-limit aware:** on HTTP 429
  or a network failure the page shows a friendly error and keeps the last
  good data. If the API is unreachable on first load, it says so plainly —
  CoinWatch never shows invented prices.
- **Shareable URL** — `?currency=inr|usd` restores the display currency.

## Example output

All figures below are computed from the saved snapshot
`examples/markets-inr.json` (CoinGecko, fetched 2026-11-10 ~08:05 IST,
`last_updated` 2026-11-10T02:25:46Z) — run `npm test` to re-verify them
against that file. Prices move minute to minute; the live page will differ.

```
Top 5 by market cap (INR, 2026-11-10 snapshot):
  1  Bitcoin    ₹70,04,743   -1.10%  mcap ₹140.87 lakh cr
  2  Ethereum   ₹1,98,424    -1.80%  mcap ₹24.25 lakh cr
  3  Tether     ₹93.55       -0.30%
  4  BNB        ₹64,431      -0.49%
  5  USD Coin   ₹93.59       -0.30%

Top-20 total market cap: ₹223.66 lakh crore
Bitcoin 7d range (from sparkline): ₹68,95,047 – ₹75,33,871
Bitcoin all-time high: ₹1,11,87,013 (-37.39% from ATH)
Ethereum all-time high: ₹4,31,946 (-54.06% from ATH)

A red day: every coin in the top 20 with a reported 24h change was down.
Biggest fall: Zcash -7.34%. Smallest fall: LEO Token -0.18%.
(figure-heloc reported no 24h change in the snapshot.)
```

Portfolio example — 0.5 BTC bought at ₹65,00,000, valued at the snapshot
price of ₹70,04,743:

```
Invested:       ₹32,50,000
Current value:  ₹35,02,372
Gain:           +₹2,52,372 (+7.77%)
Est. VDA tax:   ₹75,711  (30% of the gain — estimate, not tax advice)
```

## How to run it

```bash
npm install   # install dev dependencies (TypeScript, Vite, Vitest)
npm test      # run the test suite
npm run dev   # start the dev server
npm run build # type-check + production build into docs/
```

Open `docs/index.html` through any static server after building
(e.g. `python3 -m http.server --directory docs`), or enable GitHub Pages
on the repo: Settings → Pages → branch `main`, folder `/docs`.

## Stack

Vite + vanilla TypeScript, zero runtime dependencies. Vitest tests.
`docs/` is the production Vite build (`base: './'`, relative asset paths)
so it runs at `https://judd69.github.io/coinwatch/`.

## Data & honesty

- **Source:** CoinGecko markets API (free tier, no key):
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h`
- **Prices are CoinGecko aggregates across exchanges — NOT an exchange's
  executable price.** The number you can actually sell at will differ.
- **Crypto is unregulated in India. Nothing here is investment advice.**
- **Tax:** India taxes gains on virtual digital assets at a flat 30%. The
  figure shown is an estimate on the current unrealised gain only — it
  ignores surcharge, cess, fees, losses elsewhere and TDS. Not tax advice.
- **Sparkline quirk:** CoinGecko returns `sparkline_in_7d.price` in USD
  even when `vs_currency=inr`. The sparkline's shape is currency
  independent, so it draws correctly as-is; the 7d high/low in the detail
  panel converts the sparkline through the implied rate (current price ÷
  last sparkline point, ₹93.39/$ for BTC in the snapshot) and is labelled
  as an approximation.
- **No sample prices.** The app ships no fake coins and no demo prices;
  `examples/markets-inr.json` is a labelled real snapshot used by the
  tests. If the API is unreachable, the page says so.

## Files

```
index.html            Vite entry (nav, hero, portfolio, market, alerts, footer)
src/api.ts            CoinGecko client: fetchMarkets, URL builder, 429/network errors
src/format.ts         en-IN ₹ grouping, lakh/crore compacting, % and relative time
src/portfolio.ts      Pure holdings math: value, invested, gain/loss, 30% tax estimate
src/alerts.ts         Pure alert evaluation: above/below crossing, re-arm rules
src/sparkline.ts      Pure SVG path + stats from a price array (empty-safe)
src/main.ts           All UI wiring, rendering, 60s refresh loop, error states
src/style.css         Jeton fintech styling: paper #FAFAF7, ink #111111, coin-gold #D97706
tests/                Vitest: format, portfolio, alerts, sparkline, api (snapshot)
examples/             markets-inr.json — real CoinGecko snapshot, 2026-11-10
```

## License

MIT — see `LICENSE`.
