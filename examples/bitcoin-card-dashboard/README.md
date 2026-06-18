# Bitcoin Card local dashboard

Simple local test page for viewing current Bitcoin info in a browser.

## Run

From this directory:

```bash
node server.mjs
```

Then open:

```text
http://127.0.0.1:8787/
```

Or choose another port:

```bash
PORT=8790 node server.mjs
```

## What it shows

- BTC/USD price from Coinbase + Kraken
- Current block height from mempool.space + Blockstream
- Recommended mempool fees
- Hashrate and difficulty from mempool.space
- Derived current supply, unmined BTC, and next halving ETA
- BMRI full-vs-lite comparison chart
- Bitcoin Risk composite chart and component breakdown

The browser calls the local server endpoints; the local server fetches public APIs to avoid browser CORS problems.

## Local endpoints

- `/api/summary` — price, block height, fees, mining, supply, halving context.
- `/api/fee-history?range=1w` — fee-rate percentile bands for supported ranges: `24h`, `3d`, `1w`, `1m`, `3m`, `6m`, `1y`, `2y`, `3y`.
- `/api/fee-profile?cadence=weekly&buyAmountUsd=100&targetVbytes=140` — patient DCA fee recommendation with estimated USD fee and fee as % of planned buy.
- `/api/bmri-comparison` — Full Checkonchain BMRI versus transparent BMRI-lite.
- `/api/bitcoin-risk` — bitcoin-card's native 0-100 Bitcoin Risk composite.

## Bitcoin Risk wording

Here, risk follows the plain finance meaning used by Investor.gov: risk is uncertainty and/or possible financial loss in an investment decision. Bitcoin-card narrows that to valuation/cycle context: high values mean Bitcoin is historically stretched versus its own valuation, issuance, and moving-average history; low values mean historically cooler conditions. High can be interpreted as a possible trimming/selling-zone context and low as a possible accumulation/buying-zone context, but it is not advice or a trade signal.
