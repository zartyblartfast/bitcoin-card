# Future Direction: Bitcoin Metrics API / Open BMRI

## Context

The Bitcoin Card project now has a working MCP package (`bitcoin-info-mcp`) and a local dashboard prototype. During BMRI research we found a useful product gap:

> Glassnode-like Bitcoin valuation metrics are valuable, but existing providers are expensive, dashboard-first, and often priced for institutions. There may be room for a Bitcoin-only, transparent, developer/agent-friendly metrics API at hobbyist/indie pricing.

This is not a plan to clone Glassnode. The realistic wedge is narrower:

- Bitcoin-only
- transparent methodology
- daily/cached metrics rather than real-time institutional data
- API-first / MCP-first
- clear caveats and reproducible formulas
- simple pricing if it ever becomes commercial

## Product Thesis

A useful product could be:

> Open, explainable Bitcoin valuation metrics via API.

Target users:

- Bitcoin educators
- newsletter writers
- financial planners
- indie app developers
- AI agent builders
- portfolio trackers
- hobby quants
- small funds or researchers who cannot justify Glassnode pricing
- retirement / wealth-planning tools needing simple Bitcoin market context

Positioning:

- Not institutional trading infrastructure
- Not a full multi-asset on-chain data terminal
- Not a black-box signal product
- Instead: transparent, documented, “good enough” Bitcoin context for apps and agents

## Current BMRI Findings

Full BMRI on Checkonchain currently includes these anchors:

1. 200DMA
2. 200WMA
3. 365d-Onchain VWAP
4. 90d-Onchain VWAP
5. Realized Price
6. True Market Mean
7. STH Cost Basis
8. Cointime Price
9. Powerlaw

BMRI-lite currently uses:

1. 200DMA
2. 200WMA
3. Realized Price

Current prototype compares Full BMRI from Checkonchain’s public embedded chart data with BMRI-lite. This comparison is useful because it shows when simple/free anchors diverge from the full model.

Important caveat:

- Checkonchain does not appear to provide a formal public API.
- Current Full BMRI access is via public chart scrape.
- This is suitable for prototype/internal exploration but fragile for production unless permission/API access is obtained.

## Why This Is Harder Than “It’s All On The Blockchain”

Raw Bitcoin chain data gives:

- transactions
- outputs
- current/spent UTXO state
- block time / block height
- BTC amounts

It does not directly give:

- USD price when each UTXO was created
- investor cost basis
- short-term-holder cost basis
- cointime-adjusted price
- true market mean / active investor price
- entity-adjusted transfers
- on-chain VWAP definitions
- economic transfers vs self-churn/change outputs

The commercial value in Glassnode/Checkonchain is the derived layer: UTXO accounting, historical price joins, cohort rules, entity heuristics, cointime economics, and continuous maintenance.

## Staged Strategy

### Stage 1 — Prototype Full BMRI + BMRI-lite Comparison

Status: underway in local dashboard.

Goals:

- Use Checkonchain public chart data as Full BMRI source.
- Compute BMRI-lite transparently.
- Display both together.
- Show delta and visual divergence over time.
- Cache Checkonchain data heavily.
- Attribute source and warn that it is not an official API.

Implementation shape:

```text
get_bitcoin_mean_reversion_index
  primary:
    Checkonchain Full BMRI scrape, cached, attributed
  fallback:
    BMRI-lite from transparent/free sources
  output:
    fullIndex if available
    liteIndex
    delta
    anchors
    methodology
    caveats
    sourceQuality
```

Short-term objective:

- Keep this in the local sketch/dashboard until behaviour and usefulness are clear.
- Then promote into `packages/data` + MCP tool if it proves useful.

### Stage 2 — Harden BMRI-lite With Free/Transparent Inputs

Goal:

Make BMRI-lite independent of Checkonchain.

Inputs:

- BTC daily price
- 200DMA
- 200WMA
- Realized Price derived from Coin Metrics Community:

```text
realized_cap = market_cap / MVRV
realized_price = realized_cap / supply
```

Coin Metrics Community fields:

- `PriceUSD`
- `CapMrktCurUSD`
- `CapMVRVCur`
- `SplyCur`

Expected result:

- BMRI-lite can run without scraping Checkonchain.
- Full BMRI remains optional/comparative.
- This becomes the reliable fallback metric.

### Stage 3 — Add Native Bitcoin Risk Composite

Goal:

Add a plain-English, 0-100 Bitcoin valuation/cycle risk score alongside BMRI. This is not a clone of Benjamin Cowen's proprietary risk metric. It is a transparent bitcoin-card composite built from free or nearly-free reproducible inputs.

Default no-key/free components:

- MVRV / MVRV-Z-derived valuation score from Coin Metrics Community:
  - `CapMrktCurUSD`
  - `CapMVRVCur`
  - `SplyCur`
  - `PriceUSD`
- Puell-style issuance multiple from Coin Metrics Community:
  - `IssTotUSD / 365d moving average(IssTotUSD)`
- Mayer Multiple from BTC price history:
  - `price / 200d SMA(price)`
- 200-week moving average distance / heatmap-style score from BTC price history.
- Optional fee/miner context from Coin Metrics or Blockchain.com:
  - `FeeTotNtv`
  - Blockchain.com `transaction-fees`, `transaction-fees-usd`, `miners-revenue`
- Optional sentiment context from Alternative.me Fear & Greed, shown separately and attributed, not silently blended into valuation risk.

Potential enhanced provider:

- TradingStrategies.work / Backtesting Arena can provide useful external context via public no-key endpoints (`/api/arena-pulse/today`, `/api/btc-cycle`, `/api/fear-greed`) and broader authenticated free-tier endpoints (`/api/v1/onchain/series`, `/api/v1/charts/{slug}/latest`). Treat this as an optional third-party comparison/enhancement, not the foundation of bitcoin-card's native score.

Deliberately out of v1:

- Cowen's actual Bitcoin Risk formula/weights, because they are proprietary.
- Reserve Risk, unless a clean source or self-computed CDD pipeline is added.
- Terminal Price, unless a separate BigQuery/full-chain CDD research spike is completed.
- Entity-adjusted metrics, because clustering and change-output heuristics are not cheap to reproduce reliably.

Implementation shape:

```text
get_bitcoin_risk
  output:
    latest 0-100 composite risk score
    band: deep_value / value / neutral / elevated / high / extreme
    components:
      mvrvZDerived
      puellIssuance
      mayerMultiple
      ma200wDistance
      feePressure optional
    optional externalSignals:
      fearGreed
      tradingStrategiesArenaPulse
      tradingStrategiesBtcCycle
    history:
      daily component + composite history
    methodology
    caveats
    sourceQuality
```

Important labels:

- Call it `bitcoin-card risk`, `bitcoinRisk`, or `freeCompositeRisk`.
- Do not call it `Cowen Risk`.
- Expose component values and caveats so users can see what drove the score.

### Stage 4 — Investigate Free/Scrapable Supplementary Sources

Potential sources:

- Checkonchain
- LookIntoBitcoin / BitcoinMagazinePro
- Woobull
- public chart pages with embedded datasets
- TradingStrategies.work, where a free-tier key is acceptable

Candidate metrics:

- Powerlaw
- Realized Price
- Short-Term Holder Realized Price / STH Cost Basis proxy
- MVRV / MVRV Z-score
- NUPL
- Reserve Risk
- Puell Multiple
- SOPR
- Hash Ribbons
- Pi Cycle

Goal:

Find robust unauthenticated endpoints, documented free-key APIs, or embedded datasets that can reduce dependence on Checkonchain’s single page and improve the Bitcoin Risk composite.

Caveat:

- Scraping should be treated as fragile.
- Prefer official APIs, cached static datasets, or authenticated free tiers with clear terms.
- Prefer caching and attribution.
- Avoid high-frequency polling.

### Stage 5 — Build Approximate Open BMRI Components

Goal:

Start replacing scraped/proprietary inputs with our own transparent approximations.

Candidate open components:

- 90d on-chain VWAP approximation
- 365d on-chain VWAP approximation
- simple STH cost basis by UTXO age
- simple LTH/STH cohort models
- powerlaw fit from historical price
- cointime-lite approximation, if feasible

Potential infrastructure:

- Dune public queries
- Google BigQuery public Bitcoin dataset
- local Bitcoin Core + UTXO snapshots
- DuckDB/Postgres for daily metric generation

Important caveat:

These should be labelled as approximations, not Glassnode-equivalent metrics. Entity-adjustment and change-output filtering are hard and may not be reproduced exactly.

### Stage 6 — Daily Static Dataset

Goal:

Avoid building a costly live API too early.

Architecture:

```text
Daily cron job
  -> compute metrics
  -> write static JSON/CSV files
  -> publish to Cloudflare Pages/R2 or GitHub Pages
  -> serve via CDN
```

Example files:

```text
/latest.json
/metrics/bmri-lite.json
/metrics/mean-reversion.json
/metrics/realized-price.json
/history/daily.csv
/history/bmri-lite.csv
```

Benefits:

- cheap infrastructure
- simple caching
- easy for developers to consume
- no database needed initially
- easy to inspect/debug

### Stage 7 — API / MCP Product Layer

Once data is stable, provide:

- REST API
- MCP server
- JSON schemas
- markdown explanations
- example prompts
- dashboard examples

Useful response style:

```json
{
  "metric": "bmri_lite",
  "value": 14.9,
  "zone": "deep_value",
  "interpretation": "BTC is in the cheapest 15% of historical observations relative to selected mean-reversion anchors.",
  "anchors": [],
  "methodology": "...",
  "caveats": []
}
```

Interpretation is the differentiator, not just raw values.

### Stage 8 — Commercialisation Only If Demand Appears

Do not start with subscriptions or paid API keys.

First prove:

- people use the metrics
- the methodology is trusted
- the API shape is useful
- the maintenance burden is manageable

Possible pricing later:

- Free: latest daily values, attribution required
- Hobby: low monthly price for history / no rate pain
- Indie/dev: more history, API key, higher limits
- Pro: commercial licence / bulk files / priority support

Avoid enterprise-style pricing unless demand justifies it.

## Short-Term Objectives

The next practical development steps are:

1. Keep BMRI and Bitcoin Risk as separate user-facing metrics.
2. Keep BMRI comparison logic available through the data layer / MCP surface:
   - Full BMRI from Checkonchain when available
   - BMRI-lite fallback from transparent inputs
3. Upgrade `get_bitcoin_risk` from a single MVRV-Z proxy toward a native composite:
   - MVRV-Z-derived score from Coin Metrics Community
   - Puell-style issuance multiple from Coin Metrics `IssTotUSD`
   - Mayer Multiple from price history
   - 200WMA distance / heatmap-style score from price history
   - optional fee/miner context
4. Keep Alternative.me Fear & Greed and TradingStrategies.work signals as separate context/external signals, not hidden ingredients in the native score.
5. Include component breakdown, source/caveat fields, methodology, and daily history.
6. Add tests for the composite calculation using captured/free-source fixtures.
7. Update the local dashboard and DCA bundle to show a compact latest risk card while keeping full history under raw/detail payloads.
8. Treat Reserve Risk, Terminal Price, and BigQuery CDD work as future research spikes, not v1 requirements.

## Recommended Principle

Do not overclaim.

Use clear labels:

- “Checkonchain Full BMRI”
- “BMRI-lite approximation”
- “Open BMRI approximation”
- “bitcoin-card risk” / `bitcoinRisk`
- “external signal” for TradingStrategies.work or other third-party composites

Avoid labels that overclaim:

- Do not call the native composite “Cowen Risk”.
- Do not call chart-scraped or free-key third-party data “Glassnode-equivalent”.

Make the caveats first-class API fields. Trust comes from transparency, not pretending to have institutional-grade proprietary data.
