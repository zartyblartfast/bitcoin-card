#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getBitcoinRisk, getCheckonchainMeanReversionComparison, getFeeHistory, getFeeProfile, getIndependentMeanReversionIndex } from "../../packages/data/dist/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const BUILD_REVISION = process.env.BUILD_REVISION || "uncommitted";
const HALVING_INTERVAL = 210_000;
const TARGET_BLOCK_TIME_SEC = 600;
const TOTAL_CAP = 21_000_000;
const INITIAL_REWARD = 50;
const INDEPENDENT_BMRI_CACHE_MS = 5 * 60 * 1000;
const INDEPENDENT_BMRI_RETRY_DELAY_MS = 250;
const FEE_HISTORY_RANGES = new Set(["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y"]);
const DCA_CADENCES = new Set(["daily", "weekly", "monthly"]);
let independentBmriLiteCache = null;

async function getIndependentBmriLite() {
  if (independentBmriLiteCache && Date.now() - independentBmriLiteCache.cachedAt < INDEPENDENT_BMRI_CACHE_MS) {
    return independentBmriLiteCache.value;
  }

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await getIndependentMeanReversionIndex();
      const latest = value.history.at(-1);
      if (!latest || latest.date !== value.dataDate || value.history.length !== value.historyLength) {
        throw new Error("Independent BMRI-lite response failed endpoint consistency validation");
      }
      independentBmriLiteCache = { cachedAt: Date.now(), value };
      return value;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, INDEPENDENT_BMRI_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    ...headers,
  });
  res.end(JSON.stringify(body, null, 2));
}

function badRequest(res, message) {
  json(res, 400, { error: message });
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

function independentBmriLiteMetadata(value) {
  const { history, ...metadata } = value;
  return { ...metadata, latest: history.at(-1) };
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
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (url.pathname === "/health") {
      json(res, 200, { status: "ok", buildRevision: BUILD_REVISION, now: new Date().toISOString() });
      return;
    }
    if (url.pathname === "/ready") {
      try {
        const value = await getIndependentBmriLite();
        json(res, 200, {
          status: "ready",
          buildRevision: BUILD_REVISION,
          sourceQuality: value.source.sourceQuality,
          dataDate: value.dataDate,
          historyLength: value.historyLength,
          fetchedAt: value.fetchedAt,
        });
      } catch (error) {
        json(res, 503, { status: "not_ready", buildRevision: BUILD_REVISION, error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/summary") {
      json(res, 200, await getSummary());
      return;
    }
    if (url.pathname === "/api/fee-history") {
      const range = url.searchParams.get("range") || "24h";
      if (!FEE_HISTORY_RANGES.has(range)) return badRequest(res, `Unsupported fee history range: ${range}`);
      json(res, 200, await getFeeHistory(range));
      return;
    }
    if (url.pathname === "/api/fee-profile") {
      const cadence = url.searchParams.get("cadence");
      const buyAmountUsd = Number(url.searchParams.get("buyAmountUsd"));
      const targetVbytesParam = url.searchParams.get("targetVbytes");
      const targetVbytes = targetVbytesParam == null ? undefined : Number(targetVbytesParam);
      if (!cadence || !DCA_CADENCES.has(cadence)) return badRequest(res, "cadence must be daily, weekly, or monthly");
      if (!Number.isFinite(buyAmountUsd) || buyAmountUsd <= 0) return badRequest(res, "buyAmountUsd must be positive");
      if (targetVbytes !== undefined && (!Number.isFinite(targetVbytes) || targetVbytes <= 0)) return badRequest(res, "targetVbytes must be positive");
      json(res, 200, await getFeeProfile({ cadence, buyAmountUsd, ...(targetVbytes === undefined ? {} : { targetVbytes }) }));
      return;
    }
    if (url.pathname === "/api/bmri-lite") {
      try {
        json(res, 200, independentBmriLiteMetadata(await getIndependentBmriLite()));
      } catch (error) {
        json(res, 503, { error: "Independent BMRI-lite is unavailable, stale, or invalid", detail: error.message });
      }
      return;
    }
    if (url.pathname === "/api/bmri-lite/history") {
      try {
        const value = await getIndependentBmriLite();
        json(res, 200, { ...independentBmriLiteMetadata(value), history: value.history }, { "cache-control": "public, max-age=300" });
      } catch (error) {
        json(res, 503, { error: "Independent BMRI-lite is unavailable, stale, or invalid", detail: error.message });
      }
      return;
    }
    if (url.pathname === "/api/bmri-full-comparison") {
      json(res, 200, await getCheckonchainMeanReversionComparison());
      return;
    }
    if (url.pathname === "/api/bitcoin-risk") {
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
