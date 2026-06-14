import type { MeanReversionHistoryPoint, MeanReversionIndex } from "./types.js";

export const CHECKONCHAIN_BMRI_URL =
  "https://charts.checkonchain.com/btconchain/pricing/meanreversion_index/meanreversion_index_light.html";

const FULL_ANCHORS = [
  "200DMA",
  "200WMA",
  "365d-Onchain VWAP",
  "90d-Onchain VWAP",
  "Realized Price",
  "True Market Mean",
  "STH Cost Basis",
  "Cointime Price",
  "Powerlaw",
] as const;

const LITE_ANCHORS = ["200DMA", "200WMA", "Realized Price"] as const;

type PlotlyTrace = {
  name?: string;
  x?: unknown;
  y?: unknown;
};

type Series = Map<string, number>;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "bitcoin-card-data/0.1" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.text();
}

function extractJsonArrayAfter(haystack: string, marker: string): unknown[] {
  const markerIndex = haystack.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} not found`);
  const start = haystack.indexOf("[", markerIndex);
  if (start < 0) throw new Error(`JSON array after ${marker} not found`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return JSON.parse(haystack.slice(start, i + 1)) as unknown[];
      }
    }
  }
  throw new Error("Could not parse Plotly data array");
}

function decodePlotlyArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || !("bdata" in value)) return [];

  const typed = value as { bdata: string; dtype?: string };
  const buffer = Buffer.from(typed.bdata, "base64");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dtype = typed.dtype ?? "f8";
  const readers: Record<string, { size: number; read: (offset: number) => number }> = {
    f8: { size: 8, read: offset => view.getFloat64(offset, true) },
    f4: { size: 4, read: offset => view.getFloat32(offset, true) },
    i4: { size: 4, read: offset => view.getInt32(offset, true) },
    u4: { size: 4, read: offset => view.getUint32(offset, true) },
    i2: { size: 2, read: offset => view.getInt16(offset, true) },
    u2: { size: 2, read: offset => view.getUint16(offset, true) },
    i1: { size: 1, read: offset => view.getInt8(offset) },
    u1: { size: 1, read: offset => view.getUint8(offset) },
  };
  const reader = readers[dtype];
  if (!reader) throw new Error(`Unknown Plotly dtype: ${dtype}`);

  const out: number[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += reader.size) {
    out.push(reader.read(offset));
  }
  return out;
}

function seriesFromTrace(trace: PlotlyTrace): Series {
  const xs = decodePlotlyArray(trace.x);
  const ys = decodePlotlyArray(trace.y);
  const out: Series = new Map();
  const len = Math.min(xs.length, ys.length);
  for (let i = 0; i < len; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof y === "number" && Number.isFinite(y)) {
      out.set(String(x).slice(0, 10), y);
    }
  }
  return out;
}

function movingAverage(values: number[], window: number): number[] {
  const out = Array<number>(values.length).fill(Number.NaN);
  const queue: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    queue.push(values[i]!);
    sum += values[i]!;
    if (queue.length > window) sum -= queue.shift()!;
    if (queue.length === window) out[i] = sum / window;
  }
  return out;
}

function percentileRank(sortedValues: number[], value: number): number {
  if (!sortedValues.length) return Number.NaN;
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return (100 * lo) / sortedValues.length;
}

function insertSorted(values: number[], value: number): void {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (values[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  values.splice(lo, 0, value);
}

function makeLiteIndex(
  dates: string[],
  priceValues: number[],
  anchors: Record<string, number[]>,
): { values: Map<string, number>; components: Map<string, Record<string, number | null>> } {
  const histories = Object.fromEntries(Object.keys(anchors).map(name => [name, [] as number[]]));
  const values = new Map<string, number>();
  const components = new Map<string, Record<string, number | null>>();

  for (let i = 0; i < dates.length; i++) {
    const price = priceValues[i]!;
    const component: Record<string, number | null> = {};
    const available: number[] = [];

    for (const [name, series] of Object.entries(anchors)) {
      const anchor = series[i];
      if (!Number.isFinite(price) || !Number.isFinite(anchor) || price <= 0 || !anchor || anchor <= 0) {
        component[name] = null;
        continue;
      }
      const ratio = price / anchor;
      const percentile = percentileRank(histories[name]!, ratio);
      insertSorted(histories[name]!, ratio);
      if (Number.isFinite(percentile)) {
        component[name] = percentile;
        available.push(percentile);
      } else {
        component[name] = null;
      }
    }

    if (available.length) {
      const day = dates[i]!;
      values.set(day, available.reduce((a, b) => a + b, 0) / available.length);
      components.set(day, component);
    }
  }

  return { values, components };
}

function meanAbsoluteError(rows: MeanReversionHistoryPoint[]): number | null {
  return rows.length
    ? rows.reduce((sum, row) => sum + Math.abs(row.difference), 0) / rows.length
    : null;
}

function optionalLatest(series: Record<string, Series>, name: string, day: string | undefined): number | null {
  if (!day) return null;
  return series[name]?.get(day) ?? null;
}

export function parseCheckonchainMeanReversionHtml(html: string): MeanReversionIndex {
  const traces = extractJsonArrayAfter(html, "Plotly.newPlot(") as PlotlyTrace[];
  const series = Object.fromEntries(
    traces.map(trace => [trace.name || "(blank)", seriesFromTrace(trace)]),
  ) as Record<string, Series>;
  const priceSeries = series.Price;
  const fullSeries = series.Index;
  if (!priceSeries || !fullSeries) {
    throw new Error("Checkonchain BMRI chart did not contain Price and Index traces");
  }

  const dates = Array.from(priceSeries.keys()).sort();
  const price = dates.map(day => priceSeries.get(day)!);
  const ma200d = movingAverage(price, 200);
  const ma200w = movingAverage(price, 1400);
  const realizedPrice = dates.map(day => series["Realized Price"]?.get(day) ?? Number.NaN);
  const { values: liteValues, components } = makeLiteIndex(dates, price, {
    "200DMA": ma200d,
    "200WMA": ma200w,
    "Realized Price": realizedPrice,
  });

  const history: MeanReversionHistoryPoint[] = dates
    .filter(day => fullSeries.has(day) && liteValues.has(day))
    .map(day => {
      const fullIndex = fullSeries.get(day)!;
      const liteIndex = liteValues.get(day)!;
      return {
        date: day,
        price: priceSeries.get(day)!,
        fullIndex,
        liteIndex,
        difference: liteIndex - fullIndex,
      };
    });

  const latest = history.at(-1);
  if (!latest) throw new Error("No overlapping BMRI full/lite history found");
  const latestDay = latest.date;
  const recent = history.slice(-365);

  return {
    source: {
      full: "Checkonchain public Bitcoin Mean Reversion Index chart",
      url: CHECKONCHAIN_BMRI_URL,
      note: "Full BMRI is parsed from embedded public Plotly chart data, not an official API.",
      sourceQuality: "public-chart-scrape",
    },
    methodology: {
      lite: "Average of point-in-time percentile ranks for price/anchor ratios using 200DMA, 200WMA, and Realized Price.",
      liteAnchors: [...LITE_ANCHORS],
      fullAnchors: [...FULL_ANCHORS],
    },
    latest: {
      ...latest,
      liteComponents: components.get(latestDay) ?? {},
      fullAnchors: FULL_ANCHORS.map(name => ({ name, value: optionalLatest(series, name, latestDay) })),
      fastIndex: optionalLatest(series, "Fast Index", latestDay),
      slowIndex: optionalLatest(series, "Slow Index", latestDay),
      floorIndex: optionalLatest(series, "Floor Index", latestDay),
      ceilingIndex: optionalLatest(series, "Ceiling Index", latestDay),
      indexSpread: optionalLatest(series, "Index_Spread", latestDay),
    },
    stats: {
      recentDays: recent.length,
      recentMeanAbsoluteError: meanAbsoluteError(recent),
      allDays: history.length,
      allMeanAbsoluteError: meanAbsoluteError(history),
    },
    history,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getMeanReversionIndex(): Promise<MeanReversionIndex> {
  const html = await fetchText(CHECKONCHAIN_BMRI_URL);
  return parseCheckonchainMeanReversionHtml(html);
}
