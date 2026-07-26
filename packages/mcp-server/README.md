# bitcoin-card-mcp

[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/bitcoin-card-mcp.svg)](https://www.npmjs.com/package/bitcoin-card-mcp)

Trustworthy Bitcoin data for AI coding assistants, via the [Model Context Protocol](https://modelcontextprotocol.io).

Cross-source price verification, mempool fees, fee history, network stats, a pure-derivation unmined supply function, BMRI context, and a Coin Metrics Community API-derived MVRV Z-Score risk proxy. Open source. No marketing, no fluff.

## Install (4 lines)

For **Claude Desktop** - add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bitcoin-info": {
      "command": "npx",
      "args": ["-y", "bitcoin-card-mcp"]
    }
  }
}
```

For **Claude Code**, **Cursor**, **Cline**, **Continue**, **Zed**, **Hermes Agent** - the same shape, in their respective config file. For Hermes Agent specifically, the equivalent YAML in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  bitcoin-info:
    command: "npx"
    args: ["-y", "bitcoin-card-mcp"]
    timeout: 120
```

Then restart your AI client and ask: *"What's the current Bitcoin price and block height?"* It should call `get_bitcoin_price` and `get_block_height` and report back with source agreement.

## Available tools

| Tool | Description |
|------|-------------|
| `get_bitcoin_price` | Spot price, cross-source verified across Coinbase and Kraken |
| `get_block_height` | Current tip, verified across mempool.space and Blockstream |
| `get_mempool_fees` | 4 fee tiers (fastest, 30-min, 1-hour, minimum) in sat/vB |
| `get_fee_history` | Fee-rate percentile bands for 24h, 3d, 1w, 1m, 3m, 6m, 1y, 2y, or 3y |
| `get_fee_profile` | Patient DCA fee recommendation with estimated USD fee and fee % of buy |
| `get_network_summary` | One-shot bundle: price, height, hashrate, difficulty, unmined, halving ETA |
| `get_unmined_supply` | Pure halving-schedule derivation with verifiable formula |
| `get_bitcoin_risk` | Coin Metrics Community API-derived MVRV Z-Score risk proxy with local 0-100 score, band, daily cache, plus separate Alternative.me Fear & Greed sentiment when available |
| `get_bitcoin_mean_reversion_index` | Full Checkonchain BMRI + transparent BMRI-lite comparison, delta, anchors, and caveats |
| `get_dca_metrics` | Compact DCA-app bundle: verified price, fees, network state, BMRI zone/caveat, and Bitcoin risk proxy |

Plus a reusable prompt:

| Prompt | Description |
|--------|-------------|
| `bitcoin-market-brief` | Composes `get_network_summary` + `get_mempool_fees` into a 4-sentence market brief |

## Example response

`get_bitcoin_price("USD")` returns:

```json
{
  "price": 67025.0,
  "currency": "USD",
  "sources": [
    { "source": "coinbase", "value": 67000.0, "fetchedAt": "2026-06-01T..." },
    { "source": "kraken",  "value": 67050.0, "fetchedAt": "2026-06-01T..." }
  ],
  "agreement": "verified",
  "fetchedAt": "2026-06-01T..."
}
```

The `agreement` field is one of `"verified"` (sources within 0.5%), `"disputed"` (sources diverge beyond 0.5%), or `"single-source"` (one source failed). The result includes both individual source values plus the mean - never a single opaque number.

## Tools reference

### `get_bitcoin_price(currency?)`

Get the current Bitcoin spot price with cross-source verification.

- `currency` (optional, default `"USD"`) - `"USD" | "EUR" | "GBP"`

Returns `PriceData`: `{ price, currency, sources[], agreement, fetchedAt }`.

### `get_block_height()`

Get the current Bitcoin block height, verified across mempool.space and Blockstream.

Returns `BlockHeightData`: `{ height, sources[], agreement, fetchedAt }`.

### `get_mempool_fees()`

Get current recommended mempool transaction fees in sat/vB at four confirmation targets.

Returns `MempoolFees`: `{ fastestFee, halfHourFee, hourFee, minimumFee, sources[], fetchedAt }`.

### `get_fee_history(range?)`

Get historical mempool fee-rate distribution bands from Bitcoin Card.

- `range` (optional, default `"24h"`) - `"24h" | "3d" | "1w" | "1m" | "3m" | "6m" | "1y" | "2y" | "3y"`

Returns `FeeHistory`: `{ range, points: [{ t, minFee, p10Fee, p25Fee, medianFee, p75Fee, p90Fee, maxFee }], source, sourceQuality, partial, note?, fetchedAt }`.

Primary source is mempool.space `/v1/mining/blocks/fee-rates/{range}`. If unavailable, Bitcoin Card may return a recent-block-derived partial fallback with a note.

### `get_fee_profile(cadence, buyAmountUsd, targetVbytes?)`

Get a realistic low-fee target for a patient DCA campaign.

- `cadence` - `"daily" | "weekly" | "monthly"`
- `buyAmountUsd` - planned buy amount in USD
- `targetVbytes` (optional, default `140`) - estimated transaction virtual size

Returns `FeeProfile`: `{ recommendedSatVb, estimatedFeeUsd, estimatedFeePctOfBuy, confidence, regime, reason, currentFees, historySummary, source, sourceQuality, limitations, fetchedAt }`.

Fee recommendations are probabilistic. They estimate realistic low-fee targets; they do not guarantee confirmation time.

### `get_network_summary()`

One-shot bundle of current Bitcoin network state. The most useful single tool for a market overview.

Returns `NetworkSummary` with: `price` (full `PriceData`), `blockHeight` (full `BlockHeightData`), `hashrate` (EH/s), `difficulty` (as a string, may exceed 2^53), `unminedBtc`, `nextHalvingEta`, `fetchedAt`.

### `get_unmined_supply()`

Get the current unmined Bitcoin supply, derived purely from block height and the halving schedule. No external API call for the calculation itself.

Returns `UnminedSupply`:

```json
{
  "unmined": 962553.125,
  "totalCap": 21000000,
  "currentSupply": 20037446.875,
  "formula": "unmined = 21,000,000 - Σ(blocks_mined × reward) over 900000 blocks, with halvings every 210,000 blocks"
}
```

### `get_bitcoin_risk()`

Get a Bitcoin valuation-risk proxy derived from Coin Metrics Community API BTC MVRV history, plus separate Alternative.me Fear & Greed sentiment when available.

Returns `BitcoinRisk` with:

- `mvrvZScore` - MVRV Z-Score derived from Coin Metrics `CapMrktCurUSD` and `CapMVRVCur` daily history
- `mvrv` - latest Coin Metrics MVRV ratio
- `riskScore` - local 0-100 score, linearly mapped from MVRV Z-Score -0.5 to 7.0 and clamped
- `band` - `deep_value | value | neutral | elevated | high | extreme`
- `dataDate` / `unixTs` - latest daily close date from Coin Metrics
- `source` / `methodology` / `limitations` - explicit attribution, derivation notes, and caveats
- `history[]` - daily Bitcoin risk history with `date`, `unixTs`, `mvrv`, `mvrvZScore`, `riskScore`, and `band`
- `sentiment` - optional Alternative.me Crypto Fear & Greed value/classification, returned separately and not blended into `riskScore`
- `sentimentStatus` - `available | unavailable`; valuation risk still returns if sentiment is unavailable

The Coin Metrics Community API is no-key and rate-limited at a much more usable community level than the previous provider's free endpoint. This tool still caches once per UTC day in-process because MVRV is a daily metric and because the derivation fetches full BTC market-cap/MVRV history.

### `get_bitcoin_mean_reversion_index()`

Get the Bitcoin Mean Reversion Index comparison.

Returns `MeanReversionIndex` with:

- `latest.fullIndex` - Full BMRI parsed from Checkonchain's public chart data when available
- `latest.liteIndex` - transparent BMRI-lite approximation from 200DMA, 200WMA, and Realized Price
- `latest.difference` - lite minus full
- `latest.fullAnchors` - the nine Full BMRI anchors
- `latest.liteComponents` - the lite percentile components
- `history[]` - full/lite comparison history
- `source.note` and `source.sourceQuality` - explicit caveat that Full BMRI is parsed from a public chart, not an official API

This is intentionally labelled as a comparison, not a trading signal.

### `get_dca_metrics()`

Get a compact Bitcoin metrics bundle suitable for a DCA app.

Returns:

- verified BTC price and source agreement
- mempool fee tiers
- block height, hashrate, difficulty, unmined BTC, next halving ETA
- compact BMRI market-context zone with source caveat
- compact Coin Metrics-derived MVRV Z-Score risk proxy with risk score, band, source quality, caveat, and optional separate sentiment
- raw supporting objects, but with BMRI history omitted to keep responses small

This is intended for display/manual decision support, not automated trading.

## Why trust this widget?

Trust is the product. The Bitcoin widget space is full of dubious services - single-source data, no attribution, stale caches. bitcoin-card is built around the opposite stance.

### Cross-source verification

- **Price** is fetched from Coinbase and Kraken in parallel. The result includes both individual values and the mean, plus an `agreement` field.
- **Block height** is fetched from mempool.space and Blockstream.
- **Unmined supply** is derived purely from block height and the halving schedule. The result includes the full derivation formula so anyone can verify the math.

### Source attribution on every response

Every tool returns a JSON object that includes, where applicable:
- `sources[]` - the individual source results (each with `source`, `value`, `fetchedAt`)
- `fetchedAt` - the top-level timestamp of the response
- `agreement` - the cross-source check result (price, block height)
- `formula` - the derivation string (unmined supply)
- `partial` + `note` - honest disclosure of incomplete data

### Open source and reproducible

The full source is on GitHub: [github.com/zartyblartfast/bitcoin-card](https://github.com/zartyblartfast/bitcoin-card). Every line of the fetchers, the zod schemas, the verification logic, and the derivation is auditable. No proprietary black boxes.

### Data sources we depend on

- **mempool.space** - block height, mempool fees, hashrate, difficulty, recent blocks for fee history
- **Coinbase** - USD/EUR/GBP spot price
- **Kraken** - USD/EUR/GBP spot price (cross-check)
- **Blockstream** - block height (cross-check)
- **Checkonchain** - Full Bitcoin Mean Reversion Index public chart data (BMRI comparison; public chart scrape, not official API)
- **Coin Metrics Community API** - BTC `CapMrktCurUSD` and `CapMVRVCur` daily history used to derive a reproducible MVRV Z-Score valuation-risk proxy
- **Alternative.me** - optional Crypto Fear & Greed market-sentiment context; attribution required next to displayed data

If any source goes down, the relevant tool degrades gracefully (returns single-source, never returns stale or made-up data) and the `agreement` flag tells the caller exactly what happened.

### Honest limits

- **Fee history** for 1m/1y/2y ranges returns `partial: true` with empty points. The plan is to accumulate daily snapshots starting with v0.2.0.
- **Full BMRI uses a public Checkonchain chart scrape, not an official API.** Responses include `sourceQuality` and a caveat. BMRI-lite is the transparent fallback path.
- **Bitcoin risk is a derived MVRV Z-Score proxy, not a proprietary composite risk index.** It uses Coin Metrics Community API daily BTC market-cap and MVRV history, derives realized cap and MVRV Z-Score locally, then caches once per UTC day in-process. Alternative.me Fear & Greed is included only as a separate sentiment field and is never blended into the valuation-risk score.
- **No shared caching layer in v0.1.0.** Most calls hit upstream APIs directly; Bitcoin risk has only an in-process daily cache. A Cloudflare Worker aggregator with cross-region caching is planned for v0.2.0.
- **No signed responses in v0.1.0.** v0.2.0 will add HMAC-signed responses for embedders who want zero-trust in our CDN.

## Architecture

```
+-------------------+         +-------------------+
|   MCP transport   |  uses   |   packages/data   |
| (this package)    | -------> |  (pure functions) |
+-------------------+         +-------------------+
        |                              |
        v                              v
   AI assistant               mempool.space, Coinbase,
   (stdio)                    Kraken, Blockstream
```

The MCP transport is a thin adapter over `@bitcoin-card/data`, which is also published from this monorepo and contains the testable data layer (fetchers, zod validation, cross-source verification, the pure halving-schedule derivation).

## Development

This is a pnpm + Turborepo monorepo. From the root:

```bash
pnpm install
pnpm -r test       # all packages
pnpm -r build      # all packages
pnpm -F @bitcoin-card/data test RUN_INTEGRATION=1   # gated real-API tests
```

Project layout:

```
bitcoin-card/
  packages/
    data/                   # Pure data layer (the testable heart)
    mcp-server/             # This package - MCP transport
  docs/
    plans/                  # Implementation plans
```

Tests: 67 unit + 4 gated integration tests in the data package, 11 e2e MCP protocol tests in this package. All run via Vitest.

## License

MIT - see [LICENSE](./LICENSE).
