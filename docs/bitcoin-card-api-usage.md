# Using the Bitcoin Card API

Bitcoin Card exposes trustworthy Bitcoin metrics through two integration surfaces:

1. MCP tools, for AI assistants and agent apps.
2. Local HTTP endpoints, used by the example dashboard and suitable for simple app integration.

There is no hosted public API in v0.1.x. Apps should either run the MCP package with `npx bitcoin-card-mcp` or run the example dashboard server locally.

## Option 1: MCP integration

Install the MCP server in your app or assistant config:

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

Main tools:

| Tool | Use |
| --- | --- |
| `get_dca_metrics` | Best compact bundle for external apps: price, fees, network state, BMRI zone/caveat, and Bitcoin risk proxy. |
| `get_bitcoin_risk` | Coin Metrics Community API-derived BTC MVRV Z-Score mapped locally to a 0-100 risk score and band, plus optional separate Alternative.me Fear & Greed sentiment; daily cached in-process. |
| `get_bitcoin_mean_reversion_index` | Full BMRI comparison payload with latest values, anchors, methodology, caveats, and history. |
| `get_network_summary` | Price, block height, hashrate, difficulty, unmined BTC, and next halving ETA. |
| `get_bitcoin_price` | Current BTC price, verified across Coinbase and Kraken. |
| `get_mempool_fees` | Current fastest, 30-minute, 1-hour, and minimum fees in sat/vB. |
| `get_fee_history` | Fee-rate percentile bands for `24h`, `3d`, `1w`, `1m`, `3m`, `6m`, `1y`, `2y`, or `3y`. |
| `get_fee_profile` | Patient DCA fee recommendation with sat/vB target, estimated USD fee, and fee as % of planned buy. |

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

### `GET /api/fee-history`

Returns fee-rate percentile bands for charting:

```bash
curl 'http://127.0.0.1:8787/api/fee-history?range=1w'
```

Supported ranges: `24h`, `3d`, `1w`, `1m`, `3m`, `6m`, `1y`, `2y`, `3y`.

Each point includes `minFee`, `p10Fee`, `p25Fee`, `medianFee`, `p75Fee`, `p90Fee`, and `maxFee` in sat/vB. Responses include `source`, `sourceQuality`, `partial`, optional `note`, and `fetchedAt`.

### `GET /api/fee-profile`

Returns a patient DCA fee recommendation:

```bash
curl 'http://127.0.0.1:8787/api/fee-profile?cadence=weekly&buyAmountUsd=100&targetVbytes=140'
```

Includes `recommendedSatVb`, `estimatedFeeUsd`, `estimatedFeePctOfBuy`, `confidence`, `regime`, `reason`, `currentFees`, and `historySummary`. Fee targets are probabilistic estimates, not guaranteed confirmation times.

### `GET /api/bitcoin-risk`

Returns the Bitcoin Risk composite payload:

```bash
curl http://127.0.0.1:8787/api/bitcoin-risk
```

Includes:

- `metric`: `bitcoin-risk-composite`.
- `riskScore`: 0-100 composite score.
- `band`: `deep_value`, `value`, `neutral`, `elevated`, `high`, or `extreme`.
- `components`: MVRV-Z-derived valuation, Puell-style issuance multiple, Mayer Multiple, and 200WMA distance.
- `history`: daily history for charting.
- `sentiment`: optional separate Alternative.me Fear & Greed context.
- `limitations`: caveat that this is not Cowen Risk, not Glassnode-equivalent, and not a trading signal.

Use this endpoint for risk cards, component charts, and visual sanity-checking against BMRI.

### `GET /api/bmri-lite`

Returns compact, independently derived BMRI-lite metadata and the latest daily point:

```bash
curl http://127.0.0.1:8787/api/bmri-lite
```

This endpoint uses only the `@bitcoin-card/data` Coin Metrics Community API implementation. It does not request or fall back to Checkonchain. It returns `source`, `methodology`, `limitations`, `dataDate`, `historyStartDate`, `historyLength`, `fetchedAt`, and `latest`; it deliberately omits the large daily history payload.

The server makes at most two bounded upstream attempts per refresh and retains only a validated five-minute in-process response. If current primary data is unavailable, stale, structurally invalid, or inconsistent, it returns HTTP `503` rather than stale or invented data.

### `GET /api/bmri-lite/history`

Returns the same independent metadata plus the complete daily `history` payload:

```bash
curl http://127.0.0.1:8787/api/bmri-lite/history
```

This response shares the validated in-process result with `/api/bmri-lite` and is HTTP-cacheable for five minutes. Use it only when daily history is required; use the compact endpoint for ordinary latest-value reads.

### `GET /api/bmri-full-comparison`

Returns an optional research comparison between Checkonchain’s scraped Full BMRI and a locally reconstructed lite approximation:

```bash
curl http://127.0.0.1:8787/api/bmri-full-comparison
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

Use this optional comparison endpoint for BMRI-specific research, diagnostics, or methodology screens. It is not the independent production signal; use `/api/bmri-lite` or `/api/bmri-lite/history` for that source.

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
| `range` | Requested range: `24h`, `3d`, `1w`, `1m`, `3m`, `6m`, `1y`, `2y`, or `3y`. |
| `points[]` | Fee-rate percentile-band datapoints. |
| `points[].t` | ISO timestamp for the bucket/datapoint. |
| `points[].minFee` | Minimum / lowest observed fee for the bucket, sat/vB. |
| `points[].p10Fee` | Approximate 10th percentile fee, sat/vB. |
| `points[].p25Fee` | Approximate 25th percentile fee, sat/vB. |
| `points[].medianFee` | Median fee, sat/vB. |
| `points[].p75Fee` | Approximate 75th percentile fee, sat/vB. |
| `points[].p90Fee` | Approximate 90th percentile fee, sat/vB. |
| `points[].maxFee` | Maximum / highest observed fee for the bucket, sat/vB. |
| `source` | Data source name. Primary source is `mempool.space`; fallback is recent-block-derived. |
| `sourceQuality` | Source quality label, e.g. `public-api-fee-rate-bands` or `recent-block-derived-fee-bands`. |
| `partial` | `true` when coverage is incomplete, sparse, approximate, or a fallback was used. |
| `note` | Optional user-facing explanation, especially for partial ranges. |
| `fetchedAt` | Response timestamp. |

### `get_fee_profile`

| Field | Meaning |
| --- | --- |
| `cadence` | Requested DCA cadence: `daily`, `weekly`, or `monthly`. |
| `buyAmountUsd` | Planned buy amount used to calculate fee as % of buy. |
| `targetVbytes` | Estimated transaction virtual size, default `140`. |
| `recommendedSatVb` | Recommended realistic low-fee target for the cadence, sat/vB. |
| `estimatedFeeUsd` | Estimated network fee at the recommended target. |
| `estimatedFeePctOfBuy` | `estimatedFeeUsd / buyAmountUsd * 100`. |
| `confidence` | 0.0–1.0 confidence that the target is realistic for the cadence. |
| `regime` | Current/recent fee environment: `quiet`, `normal`, `elevated`, `congested`, or `extreme`. |
| `reason` | Plain-English explanation suitable for UI display. |
| `currentFees` | Current fastest, half-hour, hour, and minimum fee tiers. |
| `historySummary` | Fee-history range and p10/median/p90 context used for the recommendation. |
| `source`, `sourceQuality`, `limitations`, `fetchedAt` | Provenance and caveats. |

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
| `metric` | Always `bitcoin-risk-composite` for bitcoin-card's native free-source risk score. |
| `mvrvZScore` | Derived MVRV Z-Score from Coin Metrics Community market-cap/MVRV history. |
| `mvrv` | Latest Coin Metrics BTC MVRV ratio. |
| `components` | Component breakdown used in the composite score. Each component has `value`, normalized `score`, `sourceMetric`, and `methodology`. |
| `components.mvrvZDerived` | Valuation component derived from Coin Metrics `CapMrktCurUSD` and `CapMVRVCur`. |
| `components.puellIssuance` | Puell-style component: `IssTotUSD / 365d moving average(IssTotUSD)`. |
| `components.mayerMultiple` | Price momentum/valuation component: `PriceUSD / 200d SMA(PriceUSD)`. |
| `components.ma200wDistance` | Cycle-position component: `PriceUSD / 1400d SMA(PriceUSD)`, a daily approximation of 200-week MA distance. |
| `riskScore` | Local 0-100 composite risk score, computed as the average of normalized component scores. |
| `band` | Composite risk band: `deep_value`, `value`, `neutral`, `elevated`, `high`, or `extreme`. |
| `dataDate` | Date of the Coin Metrics daily datapoint. |
| `unixTs` | Timestamp of the Coin Metrics daily datapoint. |
| `source.name` | Source label, currently `Coin Metrics Community API`. |
| `source.url` | Source endpoint used. |
| `source.sourceQuality` | Currently `community-api-derived`. |
| `history[]` | Daily risk history. Each point has `date`, `unixTs`, `mvrv`, `mvrvZScore`, `components`, `riskScore`, and `band`. |
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
| `methodology` | Derivation text for the composite score. |
| `limitations` | Caveats for the composite score; it is not Cowen Risk, not Glassnode-equivalent, and not a trading signal. |
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

- `get_bitcoin_risk` uses the no-key Coin Metrics Community API for BTC `CapMrktCurUSD`, `CapMVRVCur`, `PriceUSD`, `IssTotUSD`, and `FeeTotNtv` daily history, derives component scores locally, and caches once per UTC day in-process.
- `get_bitcoin_risk` is bitcoin-card's transparent native Bitcoin Risk composite. It combines MVRV-Z-derived valuation, Puell-style issuance multiple, Mayer Multiple, and 200WMA distance. It is not Cowen Risk, not Glassnode-equivalent, not entity-adjusted, not a proprietary composite, and not an automated trading signal. Alternative.me Fear & Greed is included only as separate market-sentiment context when available and requires attribution next to displayed data.
- TradingStrategies.work signals should remain clearly labelled external/context signals unless the user explicitly chooses an enhanced external-provider mode.
- Price and block height are cross-source checked and return agreement status.
- Full BMRI currently depends on embedded public Checkonchain chart data, not an official Checkonchain API.
- BMRI-lite is transparent and reproducible, but approximate.
- Fee history uses mempool.space fee-rate band history when available. Fallbacks are marked `partial: true` with a note; apps should not present partial/sparse fee history as authoritative.
- Fee profile recommendations estimate realistic low-fee targets for patient DCA campaigns. They are probabilistic and should use `estimated`, `likely`, or `realistic`, not guaranteed confirmation wording.
- Apps should show `fetchedAt`, source names, and caveats rather than presenting values as opaque numbers.

## Minimal app recommendation

For most external apps:

1. Start with MCP `get_dca_metrics` if your app can use MCP.
2. Use MCP `get_bitcoin_risk` directly for a small risk card; show `sentiment` separately if present, not as part of the valuation risk score.
3. Otherwise run the local HTTP server and call `/api/summary`.
4. Call `/api/bmri-full-comparison` only for optional Full-versus-lite research or methodology comparison.
