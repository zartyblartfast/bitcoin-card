# Using the Bitcoin Card API

Bitcoin Card exposes trustworthy Bitcoin metrics through two integration surfaces:

1. MCP tools, for AI assistants and agent apps.
2. Local HTTP endpoints, used by the example dashboard and suitable for simple app integration.

There is no hosted public API in v0.1.x. Apps should either run the MCP package with `npx bitcoin-info-mcp` or run the example dashboard server locally.

## Option 1: MCP integration

Install the MCP server in your app or assistant config:

```json
{
  "mcpServers": {
    "bitcoin-info": {
      "command": "npx",
      "args": ["-y", "bitcoin-info-mcp"]
    }
  }
}
```

Main tools:

| Tool | Use |
| --- | --- |
| `get_dca_metrics` | Best compact bundle for external apps: price, fees, network state, BMRI zone/caveat, and Bitcoin risk proxy. |
| `get_bitcoin_risk` | Coin Metrics Community API-derived BTC MVRV Z-Score mapped locally to a 0-100 risk score and band, plus optional separate Alternative.me Fear & Greed sentiment; daily cached in-process. |
| `get_bitcoin_mean_reversion_index` | Full BMRI comparison payload with latest values, anchors, methodology, caveats, and history. |
| `get_network_summary` | Price, block height, hashrate, difficulty, unmined BTC, and next halving ETA. |
| `get_bitcoin_price` | Current BTC price, verified across Coinbase and Kraken. |
| `get_mempool_fees` | Current fastest, 30-minute, 1-hour, and minimum fees in sat/vB. |
| `get_fee_history` | Fee history for `24h`, `1w`, `1m`, `1y`, or `2y`; long ranges are currently partial. |

Recommended app flow:

- Use `get_dca_metrics` for normal screen loads.
- Use `get_bitcoin_risk` directly if the app only needs valuation-risk context.
- Use `get_bitcoin_mean_reversion_index` only when the app needs BMRI history or anchor details.
- Display source caveats from the response, especially for BMRI, the Bitcoin risk proxy, and Alternative.me sentiment attribution if shown.
- Do not treat BMRI or Bitcoin risk as automated trading signals.

## Option 2: Local HTTP endpoints

From the repository root:

```bash
pnpm install
pnpm -r build
node examples/bitcoin-card-dashboard/server.mjs
```

The server listens on:

```text
http://127.0.0.1:8787
```

### `GET /api/summary`

Returns a compact Bitcoin metrics summary:

```bash
curl http://127.0.0.1:8787/api/summary
```

Includes:

- BTC/USD price with Coinbase/Kraken source checks.
- Block height with mempool.space/Blockstream source checks.
- Current mempool fee tiers.
- Hashrate and difficulty.
- Current supply, unmined BTC, blocks until halving, and estimated next halving time.

Use this endpoint for general Bitcoin metrics screens.

### `GET /api/bmri-comparison`

Returns the Bitcoin Mean Reversion Index payload:

```bash
curl http://127.0.0.1:8787/api/bmri-comparison
```

Includes:

- `latest.fullIndex`: Full BMRI parsed from Checkonchain public chart data.
- `latest.liteIndex`: BMRI-lite approximation using 200DMA, 200WMA, and Realized Price.
- `latest.difference`: Lite index minus full index.
- `latest.fullAnchors`: Full BMRI anchor values.
- `latest.liteComponents`: Lite component percentile values.
- `stats`: Recent and all-history error statistics.
- `history`: Full/lite comparison history.
- `source.note`: Caveat that Full BMRI is parsed from public chart data, not an official API.

Use this endpoint for BMRI-specific charts, diagnostics, or methodology screens.

## Response field reference

The TypeScript interfaces in `packages/data/src/types.ts` are the source of truth. This section gives API users plain-English meanings for the fields returned by the MCP tools and local HTTP surfaces.

### Common fields

| Field | Meaning |
| --- | --- |
| `fetchedAt` | ISO timestamp for when bitcoin-card produced the response. |
| `sources[]` | Per-upstream source records. Each has `source`, `value`, and `fetchedAt`. |
| `agreement` | Cross-source check status: `verified`, `disputed`, or `single-source`. |
| `sourceQuality` | How robust the data source/method is, e.g. `community-api-derived`, `public-chart-scrape`, `free-api-attribution-required`. |
| `caveat`, `limitations`, `note` | Human-readable warnings that should be shown or made available to users. |
| `dataDate` | Date the underlying daily metric refers to, which can lag `fetchedAt`. |
| `unixTs` | Unix timestamp, in seconds, for the underlying datapoint. |

### `get_bitcoin_price`

| Field | Meaning |
| --- | --- |
| `price` | Mean BTC price from available sources, in requested currency. |
| `currency` | `USD`, `EUR`, or `GBP`. |
| `sources[]` | Individual Coinbase/Kraken source prices. |
| `agreement` | Whether sources agree within bitcoin-card's tolerance. |
| `fetchedAt` | Response timestamp. |

### `get_block_height`

| Field | Meaning |
| --- | --- |
| `height` | Current Bitcoin block height. |
| `sources[]` | Individual mempool.space/Blockstream heights. |
| `agreement` | Whether block-height sources agree. |
| `fetchedAt` | Response timestamp. |

### `get_mempool_fees`

| Field | Meaning |
| --- | --- |
| `fastestFee` | Suggested sat/vB fee for fastest confirmation. |
| `halfHourFee` | Suggested sat/vB fee for roughly 30-minute confirmation. |
| `hourFee` | Suggested sat/vB fee for roughly 1-hour confirmation. |
| `minimumFee` | Current minimum relay/low-priority fee estimate in sat/vB. |
| `sources[]` | Upstream fee source records. |
| `fetchedAt` | Response timestamp. |

### `get_fee_history`

| Field | Meaning |
| --- | --- |
| `range` | Requested range: `24h`, `1w`, `1m`, `1y`, or `2y`. |
| `points[]` | Fee datapoints, each `{ t, fee }`. |
| `points[].t` | ISO timestamp for the datapoint. |
| `points[].fee` | Fee in sat/vB. |
| `source` | Data source name. |
| `partial` | `true` when history is incomplete or still being accumulated. |
| `note` | Optional explanation, especially for partial ranges. |

### `get_network_summary`

| Field | Meaning |
| --- | --- |
| `price` | Full `get_bitcoin_price` payload. |
| `blockHeight` | Full `get_block_height` payload. |
| `hashrate` | Estimated network hashrate in EH/s. |
| `difficulty` | Current network difficulty. MCP JSON serialization may expose this as a string when needed. |
| `unminedBtc` | BTC remaining to be mined under the 21M cap. |
| `nextHalvingEta` | Estimated ISO timestamp for the next halving. |
| `fetchedAt` | Response timestamp. |

### `get_unmined_supply`

| Field | Meaning |
| --- | --- |
| `unmined` | BTC still unmined. |
| `totalCap` | Bitcoin terminal supply cap, normally `21000000`. |
| `currentSupply` | Derived mined supply at the current block height. |
| `formula` | Human-readable derivation from block height and halving schedule. |

### `get_bitcoin_risk`

| Field | Meaning |
| --- | --- |
| `metric` | Always `mvrv-zscore` for the valuation-risk proxy. |
| `mvrvZScore` | Derived MVRV Z-Score from Coin Metrics Community market-cap/MVRV history. |
| `mvrv` | Latest Coin Metrics BTC MVRV ratio. |
| `riskScore` | Local 0-100 valuation-risk score mapped from MVRV Z-Score. This is not blended with sentiment. |
| `band` | Valuation band: `deep_value`, `value`, `neutral`, `elevated`, `high`, or `extreme`. |
| `dataDate` | Date of the Coin Metrics daily datapoint. |
| `unixTs` | Timestamp of the Coin Metrics daily datapoint. |
| `source.name` | Source label, currently `Coin Metrics Community API`. |
| `source.url` | Source endpoint used. |
| `source.sourceQuality` | Currently `community-api-derived`. |
| `history[]` | Daily valuation-risk history. Each point has `date`, `unixTs`, `mvrv`, `mvrvZScore`, `riskScore`, and `band`. |
| `sentiment` | Optional separate Alternative.me Crypto Fear & Greed context. Not part of `riskScore`. |
| `sentimentStatus` | `available` when `sentiment` is present; `unavailable` when sentiment fetch failed or was omitted. |
| `sentiment.metric` | Always `crypto-fear-and-greed` when present. |
| `sentiment.value` | Alternative.me score from 0 to 100. |
| `sentiment.classification` | Alternative.me label such as `Extreme Fear`, `Fear`, `Neutral`, `Greed`, or `Extreme Greed`. |
| `sentiment.dataDate` | Date of the sentiment datapoint. |
| `sentiment.unixTs` | Timestamp of the sentiment datapoint. |
| `sentiment.source.*` | Alternative.me attribution and source quality. Display attribution next to the sentiment value if shown. |
| `sentiment.methodology` | Explanation that sentiment is context, not valuation risk. |
| `sentiment.limitations` | Warning that the sentiment score is partly black-box/behavioral and attribution-required. |
| `methodology` | Derivation text for the valuation-risk score. |
| `limitations` | Caveats for the valuation-risk score. |
| `fetchedAt` | Response timestamp. |

### `get_bitcoin_mean_reversion_index`

| Field | Meaning |
| --- | --- |
| `source.full` | Name of the full BMRI source. |
| `source.url` | Public chart URL used for the full BMRI comparison. |
| `source.note` | Caveat that this is parsed from public chart data, not an official API. |
| `source.sourceQuality` | `public-chart-scrape` or `lite-fallback`. |
| `methodology.lite` | Explanation of the transparent BMRI-lite calculation. |
| `methodology.liteAnchors[]` | Anchors used by BMRI-lite. |
| `methodology.fullAnchors[]` | Anchors found in the full Checkonchain chart. |
| `latest.date` | Latest datapoint date. |
| `latest.price` | BTC price at the latest datapoint. |
| `latest.fullIndex` | Latest full BMRI value. |
| `latest.liteIndex` | Latest BMRI-lite approximation. |
| `latest.difference` | `liteIndex - fullIndex`. |
| `latest.liteComponents` | Percentile/component values used in BMRI-lite. |
| `latest.fullAnchors[]` | Latest full anchor values, each `{ name, value }`; `value` can be `null` if unavailable. |
| `latest.fastIndex`, `slowIndex`, `floorIndex`, `ceilingIndex`, `indexSpread` | Optional parsed Checkonchain index components when present. |
| `stats.recentDays` | Recent comparison window size. |
| `stats.recentMeanAbsoluteError` | Recent mean absolute difference between full and lite indexes. |
| `stats.allDays` | Number of all-history comparison days. |
| `stats.allMeanAbsoluteError` | All-history mean absolute difference. |
| `history[]` | Full/lite comparison history. Each point has `date`, `price`, `fullIndex`, `liteIndex`, and `difference`. |
| `fetchedAt` | Response timestamp. |

### `get_dca_metrics`

`get_dca_metrics` is the recommended compact bundle for external apps. It intentionally omits heavy BMRI history from `raw.meanReversion`.

| Field | Meaning |
| --- | --- |
| `price.value` | Verified BTC price from `get_network_summary.price.price`. |
| `price.currency` | Price currency. |
| `price.agreement` | Price source agreement status. |
| `price.sources[]` | Individual price source records. |
| `fees.*` | Current mempool fee tiers: `fastestFee`, `halfHourFee`, `hourFee`, `minimumFee`. |
| `network.blockHeight` | Current block height. |
| `network.blockHeightAgreement` | Block-height source agreement status. |
| `network.hashrateEhS` | Estimated hashrate in EH/s. |
| `network.difficulty` | Network difficulty as a string for JSON safety. |
| `network.unminedBtc` | BTC still unmined. |
| `network.nextHalvingEta` | Estimated next halving timestamp. |
| `meanReversion.fullIndex` | Compact latest full BMRI value. |
| `meanReversion.liteIndex` | Compact latest BMRI-lite value. |
| `meanReversion.difference` | `liteIndex - fullIndex`. |
| `meanReversion.zone` | Display-oriented BMRI zone: `deep_value`, `value`, `neutral`, `warm`, `expensive`, or `overheated`. |
| `meanReversion.sourceQuality` | BMRI source quality. |
| `meanReversion.caveat` | BMRI caveat to display/make available. |
| `meanReversion.dataDate` | BMRI datapoint date. |
| `bitcoinRisk.*` | Compact fields from `get_bitcoin_risk`: `mvrvZScore`, `riskScore`, `band`, `sourceQuality`, `caveat`, `dataDate`, and optional `sentiment`. |
| `raw.networkSummary` | Full network summary object. |
| `raw.mempoolFees` | Full mempool fees object. |
| `raw.meanReversion` | BMRI object with `history` removed. |
| `raw.bitcoinRisk` | Full Bitcoin risk object, including `history[]`. |
| `fetchedAt` | Response timestamp for the DCA bundle. |

## Data caveats

- `get_bitcoin_risk` uses the no-key Coin Metrics Community API for BTC `CapMrktCurUSD` and `CapMVRVCur` daily history, derives realized cap and MVRV Z-Score locally, and caches once per UTC day in-process.
- `get_bitcoin_risk` is a transparent MVRV Z-Score valuation-risk proxy with a locally computed 0-100 score, not a proprietary composite risk index or automated trading signal. Alternative.me Fear & Greed is included only as separate market-sentiment context when available and requires attribution next to displayed data.
- Price and block height are cross-source checked and return agreement status.
- Full BMRI currently depends on embedded public Checkonchain chart data, not an official Checkonchain API.
- BMRI-lite is transparent and reproducible, but approximate.
- Fee history for `1m`, `1y`, and `2y` is currently marked partial until daily accumulation is added.
- Apps should show `fetchedAt`, source names, and caveats rather than presenting values as opaque numbers.

## Minimal app recommendation

For most external apps:

1. Start with MCP `get_dca_metrics` if your app can use MCP.
2. Use MCP `get_bitcoin_risk` directly for a small risk card; show `sentiment` separately if present, not as part of the valuation risk score.
3. Otherwise run the local HTTP server and call `/api/summary`.
4. Call `/api/bmri-comparison` only when you need BMRI-specific data or history.
