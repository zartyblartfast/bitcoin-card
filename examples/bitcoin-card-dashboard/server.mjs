#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getBitcoinRisk, getMeanReversionIndex } from "../../packages/data/dist/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HALVING_INTERVAL = 210_000;
const TARGET_BLOCK_TIME_SEC = 600;
const TOTAL_CAP = 21_000_000;
const INITIAL_REWARD = 50;
const CHECKONCHAIN_BMRI_URL = "https://charts.checkonchain.com/btconchain/pricing/meanreversion_index/meanreversion_index_light.html";
const BMRI_CACHE_MS = 6 * 60 * 60 * 1000;
let bmriCache = null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

async function fetchJson(url, parser = x => x) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "bitcoin-card-dashboard/0.1" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const text = await response.text();
    const raw = text.length && /^[\[{]/.test(text.trim()) ? JSON.parse(text) : text;
    return parser(raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function source(name, fn) {
  try {
    return { source: name, ok: true, value: await fn(), fetchedAt: new Date().toISOString() };
  } catch (error) {
    return { source: name, ok: false, error: error.message, fetchedAt: new Date().toISOString() };
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "bitcoin-card-dashboard/0.1" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonArrayAfter(haystack, marker) {
  const markerIndex = haystack.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} not found`);
  const start = haystack.indexOf("[", markerIndex);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return JSON.parse(haystack.slice(start, i + 1));
      }
    }
  }
  throw new Error("Could not parse Plotly data array");
}

function decodePlotlyArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || !value.bdata) return [];

  const buffer = Buffer.from(value.bdata, "base64");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dtype = value.dtype || "f8";
  const readers = {
    f8: { size: 8, read: (offset) => view.getFloat64(offset, true) },
    f4: { size: 4, read: (offset) => view.getFloat32(offset, true) },
    i4: { size: 4, read: (offset) => view.getInt32(offset, true) },
    u4: { size: 4, read: (offset) => view.getUint32(offset, true) },
    i2: { size: 2, read: (offset) => view.getInt16(offset, true) },
    u2: { size: 2, read: (offset) => view.getUint16(offset, true) },
    i1: { size: 1, read: (offset) => view.getInt8(offset) },
    u1: { size: 1, read: (offset) => view.getUint8(offset) },
  };
  const reader = readers[dtype];
  if (!reader) throw new Error(`Unknown Plotly dtype: ${dtype}`);
  const out = [];
  for (let offset = 0; offset < buffer.byteLength; offset += reader.size) {
    out.push(reader.read(offset));
  }
  return out;
}

function seriesFromTrace(trace) {
  const xs = decodePlotlyArray(trace.x || []);
  const ys = decodePlotlyArray(trace.y || []);
  const out = new Map();
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const y = ys[i];
    if (Number.isFinite(y)) out.set(String(xs[i]).slice(0, 10), y);
  }
  return out;
}

function movingAverage(values, window) {
  const out = Array(values.length).fill(NaN);
  let sum = 0;
  const queue = [];
  for (let i = 0; i < values.length; i++) {
    queue.push(values[i]);
    sum += values[i];
    if (queue.length > window) sum -= queue.shift();
    if (queue.length === window) out[i] = sum / window;
  }
  return out;
}

function percentileRank(sortedValues, value) {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return sortedValues.length ? (100 * lo) / sortedValues.length : NaN;
}

function insertSorted(values, value) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (values[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  values.splice(lo, 0, value);
}

function makeLiteIndex(dates, priceValues, anchors) {
  const histories = Object.fromEntries(Object.keys(anchors).map((name) => [name, []]));
  const values = new Map();
  const components = new Map();

  for (let i = 0; i < dates.length; i++) {
    const p = priceValues[i];
    const component = {};
    const available = [];
    for (const [name, series] of Object.entries(anchors)) {
      const anchor = series[i];
      if (!Number.isFinite(p) || !Number.isFinite(anchor) || p <= 0 || anchor <= 0) {
        component[name] = null;
        continue;
      }
      const ratio = p / anchor;
      const percentile = percentileRank(histories[name], ratio);
      insertSorted(histories[name], ratio);
      if (Number.isFinite(percentile)) {
        component[name] = percentile;
        available.push(percentile);
      } else {
        component[name] = null;
      }
    }
    if (available.length) {
      values.set(dates[i], available.reduce((a, b) => a + b, 0) / available.length);
      components.set(dates[i], component);
    }
  }

  return { values, components };
}

function meanAbsoluteError(rows) {
  return rows.length
    ? rows.reduce((sum, row) => sum + Math.abs(row.liteIndex - row.fullIndex), 0) / rows.length
    : null;
}

async function getBmriComparison() {
  if (bmriCache && Date.now() - bmriCache.cachedAt < BMRI_CACHE_MS) return bmriCache.value;

  const html = await fetchText(CHECKONCHAIN_BMRI_URL);
  const traces = extractJsonArrayAfter(html, "Plotly.newPlot(");
  const series = Object.fromEntries(traces.map((trace) => [trace.name || "(blank)", seriesFromTrace(trace)]));
  const priceSeries = series.Price;
  const fullSeries = series.Index;
  if (!priceSeries || !fullSeries) throw new Error("Checkonchain BMRI chart did not contain Price and Index traces");

  const dates = Array.from(priceSeries.keys()).sort();
  const price = dates.map((day) => priceSeries.get(day));
  const ma200d = movingAverage(price, 200);
  const ma200w = movingAverage(price, 1400);
  const realizedPrice = dates.map((day) => series["Realized Price"]?.get(day) ?? NaN);
  const { values: liteValues, components } = makeLiteIndex(dates, price, {
    "200DMA": ma200d,
    "200WMA": ma200w,
    "Realized Price": realizedPrice,
  });

  const history = dates
    .filter((day) => fullSeries.has(day) && liteValues.has(day))
    .map((day) => ({
      date: day,
      price: priceSeries.get(day),
      fullIndex: fullSeries.get(day),
      liteIndex: liteValues.get(day),
      difference: liteValues.get(day) - fullSeries.get(day),
    }));

  const latestDay = history.at(-1)?.date;
  const latestComponents = latestDay ? components.get(latestDay) : null;
  const checkonchainAnchors = [
    "200DMA",
    "200WMA",
    "365d-Onchain VWAP",
    "90d-Onchain VWAP",
    "Realized Price",
    "True Market Mean",
    "STH Cost Basis",
    "Cointime Price",
    "Powerlaw",
  ].map((name) => ({ name, value: series[name]?.get(latestDay) ?? null }));

  const recent = history.slice(-365);
  const value = {
    source: {
      full: "Checkonchain public Bitcoin Mean Reversion Index chart",
      url: CHECKONCHAIN_BMRI_URL,
      note: "Full BMRI is parsed from embedded public Plotly chart data, not an official API.",
    },
    methodology: {
      lite: "Average of point-in-time percentile ranks for price/anchor ratios using 200DMA, 200WMA, and Realized Price.",
      liteAnchors: ["200DMA", "200WMA", "Realized Price"],
      fullAnchors: checkonchainAnchors.map((a) => a.name),
    },
    latest: history.at(-1)
      ? {
          ...history.at(-1),
          liteComponents: latestComponents,
          fullAnchors: checkonchainAnchors,
        }
      : null,
    stats: {
      recentDays: recent.length,
      recentMeanAbsoluteError: meanAbsoluteError(recent),
      allDays: history.length,
      allMeanAbsoluteError: meanAbsoluteError(history),
    },
    history,
    fetchedAt: new Date().toISOString(),
  };
  bmriCache = { cachedAt: Date.now(), value };
  return value;
}

function computeCurrentSupply(height) {
  let supply = 0;
  let remaining = height;
  let reward = INITIAL_REWARD;
  while (remaining > 0) {
    const inThisEra = Math.min(remaining, HALVING_INTERVAL);
    supply += inThisEra * reward;
    remaining -= inThisEra;
    reward /= 2;
  }
  return supply;
}

function computeDerived(height) {
  const currentSupply = computeCurrentSupply(height);
  const unmined = TOTAL_CAP - currentSupply;
  const blocksUntilHalving = HALVING_INTERVAL - (height % HALVING_INTERVAL);
  const nextHalvingEta = new Date(Date.now() + blocksUntilHalving * TARGET_BLOCK_TIME_SEC * 1000).toISOString();
  return { currentSupply, unmined, totalCap: TOTAL_CAP, blocksUntilHalving, nextHalvingEta };
}

async function getSummary() {
  const [coinbase, kraken, mempoolHeight, blockstreamHeight, fees, mining] = await Promise.all([
    source("coinbase", () => fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot", j => Number(j.data.amount))),
    source("kraken", () => fetchJson("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", j => Number(j.result.XXBTZUSD.c[0]))),
    source("mempool", () => fetchJson("https://mempool.space/api/blocks/tip/height", Number)),
    source("blockstream", () => fetchJson("https://blockstream.info/api/blocks/tip/height", Number)),
    source("mempool", () => fetchJson("https://mempool.space/api/v1/fees/recommended")),
    source("mempool", () => fetchJson("https://mempool.space/api/v1/mining/hashrate/3d")),
  ]);

  const priceValues = [coinbase, kraken].filter(s => s.ok && Number.isFinite(s.value)).map(s => s.value);
  const price = priceValues.length ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length : null;
  const priceSpread = priceValues.length === 2 ? Math.abs(priceValues[0] - priceValues[1]) : null;

  const heightValues = [mempoolHeight, blockstreamHeight].filter(s => s.ok && Number.isFinite(s.value)).map(s => s.value);
  const height = heightValues.length ? Math.round(Math.max(...heightValues)) : null;
  const derived = height == null ? null : computeDerived(height);

  return {
    package: "bitcoin-info-mcp",
    generatedAt: new Date().toISOString(),
    price: {
      currency: "USD",
      value: price,
      agreement: priceValues.length === 2 && priceSpread <= 100 ? "verified" : priceValues.length ? "single-source" : "unavailable",
      spread: priceSpread,
      sources: [coinbase, kraken],
    },
    blockHeight: {
      value: height,
      agreement: heightValues.length === 2 && heightValues[0] === heightValues[1] ? "verified" : heightValues.length ? "single-source / slight lag" : "unavailable",
      sources: [mempoolHeight, blockstreamHeight],
    },
    fees: fees.ok ? { ...fees.value, source: fees.source, fetchedAt: fees.fetchedAt } : { error: fees.error },
    mining: mining.ok ? {
      hashrateEhS: mining.value.currentHashrate / 1e18,
      difficulty: mining.value.currentDifficulty,
      source: mining.source,
      fetchedAt: mining.fetchedAt,
    } : { error: mining.error },
    supply: derived,
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = normalize(join(__dirname, pathname));
  if (!target.startsWith(normalize(__dirname))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, { "content-type": contentTypes[extname(target)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/summary")) {
      json(res, 200, await getSummary());
      return;
    }
    if (req.url?.startsWith("/api/bmri-comparison")) {
      json(res, 200, await getMeanReversionIndex());
      return;
    }
    if (req.url?.startsWith("/api/bitcoin-risk")) {
      json(res, 200, await getBitcoinRisk());
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Bitcoin Card dashboard: http://127.0.0.1:${PORT}/`);
});
