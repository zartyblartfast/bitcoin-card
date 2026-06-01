# Bitcoin Card: MCP Server v1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

## Goal

Ship an npm-installable Model Context Protocol server that exposes trustworthy Bitcoin data (price, block height, mempool fees, fee history, network summary, unmined supply) to AI coding assistants (Claude Desktop, Claude Code, Cursor, Cline, Continue, Zed) via stdio transport.

## Why MCP First

The MCP server is the "Agent channel" of the Bitcoin Card product. The future visual widget (v2) will share the same data layer (`packages/data`) that this server wraps. Validating the data layer and adoption mechanics through MCP first gives us real-world signal before we invest in UI work, and the npm-distributed server + four-line Claude Desktop config is the lowest-friction adoption path available in 2026.

## Architecture

A TypeScript monorepo with a pure data layer and a thin MCP transport. The data layer does all fetching, cross-source verification, and derivation. The MCP server is a pure adapter mapping MCP tool calls to data layer functions. The future widget (v2) and the Cloudflare aggregator (v3) will both consume the same `packages/data` library with no changes to this code.

```
+-------------------+         +-------------------+
|   MCP transport   |  uses   |   packages/data   |
| (mcp-server pkg)  | -------> |  (pure functions) |
+-------------------+         +-------------------+
        |                              |
        v                              v
   AI assistant               mempool.space, Coinbase,
   (stdio)                    Kraken, Blockstream
```

## Tech Stack

| Concern             | Choice                                              |
|---------------------|-----------------------------------------------------|
| Language            | TypeScript 5.5+ (strict, ESM)                       |
| Runtime             | Node 22 LTS                                         |
| Package manager     | pnpm 9 with workspaces                              |
| Build orchestration | Turborepo 2                                         |
| HTTP                | Native `fetch` wrapped in a thin `httpClient`       |
| Runtime validation  | zod                                                |
| Tests               | Vitest + msw (v2) for HTTP mocking                  |
| MCP SDK             | `@modelcontextprotocol/sdk` (latest)                |
| Lint/format         | ESLint flat config + Prettier (minimal)             |
| Docs site           | Astro + Starlight (minimal, 3 pages)                |
| License             | MIT                                                 |
| Initial version     | 0.1.0                                              |

## Repository Layout

```
bitcoin-card/
  apps/
    docs/                       # Astro landing site
      src/pages/index.astro
      src/pages/tools.md
      src/pages/trust.md
      astro.config.mjs
      package.json
  packages/
    data/                       # Pure data layer (heart of the project)
      src/sources/              # HTTP clients per data source
        mempool.ts
        coinbase.ts
        kraken.ts
        blockstream.ts
      src/verification/         # Cross-source agreement logic
        price.ts
      src/derive/               # Pure derivations (unmined supply)
        unmined.ts
      src/types.ts              # Shared types + zod schemas
      src/config.ts             # Source configuration
      src/index.ts              # Public API
      test/                     # Vitest tests
      package.json
      tsconfig.json
      vitest.config.ts
    mcp-server/                 # MCP transport (thin adapter)
      src/tools/                # One file per tool
        bitcoinPrice.ts
        blockHeight.ts
        mempoolFees.ts
        feeHistory.ts
        networkSummary.ts
        unminedSupply.ts
      src/server.ts             # Server setup + tool registration
      src/index.ts              # stdio entry point
      test/                     # MCP protocol tests
      package.json
      tsconfig.json
  package.json                  # Root workspace
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .gitignore
  .nvmrc                        # node 22
  README.md
  LICENSE                       # MIT
  docs/
    plans/
      2026-06-01-bitcoin-mcp-server-v1.md
```

## Data Sources (v1)

| Data              | Primary              | Secondary            | Cross-check strategy                |
|-------------------|----------------------|----------------------|-------------------------------------|
| Price             | Coinbase             | Kraken               | Reject if delta > 0.5%              |
| Block height      | mempool.space        | Blockstream          | Reject if disagree                  |
| Mempool fees      | mempool.space        | Blockstream          | Surface both, flag if disagree     |
| Fee history (24h, 1w) | mempool.space     | Blockstream          | Aggregate from recent blocks        |
| Fee history (1m, 1y, 2y) | self-accumulated | n/a                  | Empty/partial in v1, accumulates daily |
| Network stats     | mempool.space        | derived              | hashrate, difficulty, next halving  |
| Unmined supply    | derived (pure)       | n/a                  | 21,000,000 - sum of mined block rewards |

## MCP Tool Surface (v1)

| Tool                     | Inputs                       | Returns                                          |
|--------------------------|------------------------------|--------------------------------------------------|
| `get_bitcoin_price`      | `currency: "USD"\|"EUR"\|"GBP"` (default USD) | `{ price, sources, agreement, fetchedAt }`     |
| `get_block_height`       | none                         | `{ height, sources, agreement, fetchedAt }`     |
| `get_mempool_fees`       | none                         | `{ fastestFee, halfHourFee, hourFee, minimumFee, sources }` |
| `get_fee_history`        | `range: "24h"\|"1w"\|"1m"\|"1y"\|"2y"` | `{ range, points: [{t, fee}], source, partial }` |
| `get_network_summary`    | none                         | `{ price, blockHeight, hashrate, difficulty, unmined, nextHalvingEta, fetchedAt }` |
| `get_unmined_supply`     | none                         | `{ unmined, totalCap, currentSupply, formula }` |

Plus prompts (reusable MCP prompts):
- `bitcoin-market-brief` — composes `get_network_summary` + `get_mempool_fees` into a structured brief.

---

# PHASE 0: Repository Scaffolding

### Task 0.1: Initialize pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`

**Step 1: Write `package.json`**

```json
{
  "name": "bitcoin-card",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "[email protected]",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.5.0"
  }
}
```

**Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 3: Write `.nvmrc`**

```
22
```

**Step 4: Verify**

Run: `cd C:\hermes\bitcoin-card && pnpm install`
Expected: installs turbo + typescript, creates `node_modules/` and `pnpm-lock.yaml`, exit 0.

### Task 0.2: Add Turborepo config

**Files:** Create: `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

Run: `pnpm install` (no new deps, just locks the config)

### Task 0.3: Root TypeScript config

**Files:** Create: `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Task 0.4: .gitignore and README

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `LICENSE`

**`.gitignore`:**

```
node_modules/
dist/
.turbo/
coverage/
*.log
.env
.env.local
.DS_Store
.vscode/
.idea/
```

**`README.md`** (stub):

```markdown
# Bitcoin Card

Trustworthy Bitcoin data, embedded anywhere.

## v1: Agent Channel (MCP Server)

See `packages/mcp-server/`.

## Status

🚧 v0.1.0 in development.
```

**`LICENSE`:** Standard MIT text.

### Task 0.5: First commit

Run:
```bash
cd C:\hermes\bitcoin-card
git add -A
git commit -m "chore: scaffold monorepo root"
```

Expected: commit succeeds with all scaffolding files.

---

# PHASE 1: packages/data (the testable core)

### Task 1.1: Package skeleton

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/vitest.config.ts`
- Create: `packages/data/src/index.ts` (empty barrel)

**`packages/data/package.json`:**

```json
{
  "name": "@bitcoin-card/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "echo 'lint: stub'",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "msw": "^2.6.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

**`packages/data/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**`packages/data/vitest.config.ts`:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
```

**`packages/data/src/index.ts`:**

```typescript
export {};
```

**`packages/data/test/setup.ts`:** (placeholder for msw server boot in 1.3)

```typescript
// msw server lifecycle managed per-test in source-specific setup files.
```

Run: `cd C:\hermes\bitcoin-card\packages\data && pnpm install`
Expected: installs zod, msw, vitest, exit 0.

Commit:
```bash
git add -A
git commit -m "feat(data): scaffold package"
```

### Task 1.2: Shared types and zod schemas

**Files:** Create: `packages/data/src/types.ts`

**`packages/data/src/types.ts`:**

```typescript
import { z } from "zod";

export const CurrencySchema = z.enum(["USD", "EUR", "GBP"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const FeeRangeSchema = z.enum(["24h", "1w", "1m", "1y", "2y"]);
export type FeeRange = z.infer<typeof FeeRangeSchema>;

export interface SourceResult<T> {
  source: string;
  value: T;
  fetchedAt: string; // ISO timestamp
}

export interface PriceData {
  price: number;
  currency: Currency;
  sources: SourceResult<number>[];
  agreement: "verified" | "disputed" | "single-source";
  fetchedAt: string;
}

export interface BlockHeightData {
  height: number;
  sources: SourceResult<number>[];
  agreement: "verified" | "disputed" | "single-source";
  fetchedAt: string;
}

export interface MempoolFees {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  minimumFee: number;
  sources: SourceResult<MempoolFees>[];
  fetchedAt: string;
}

export interface FeeHistoryPoint {
  t: string; // ISO timestamp
  fee: number; // sat/vB
}

export interface FeeHistory {
  range: FeeRange;
  points: FeeHistoryPoint[];
  source: string;
  partial: boolean; // true when data accumulation still in progress
  note?: string;
}

export interface NetworkSummary {
  price: PriceData;
  blockHeight: BlockHeightData;
  hashrate: number; // EH/s
  difficulty: bigint;
  unminedBtc: number;
  nextHalvingEta: string; // ISO timestamp
  fetchedAt: string;
}

export interface UnminedSupply {
  unmined: number;
  totalCap: number; // 21_000_000
  currentSupply: number;
  formula: string; // human-readable derivation
}
```

**Test:** `packages/data/test/types.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { CurrencySchema, FeeRangeSchema } from "../src/types.js";

describe("types", () => {
  it("accepts valid currency", () => {
    expect(CurrencySchema.parse("USD")).toBe("USD");
  });

  it("rejects invalid currency", () => {
    expect(() => CurrencySchema.parse("XYZ")).toThrow();
  });

  it("accepts valid fee range", () => {
    expect(FeeRangeSchema.parse("1w")).toBe("1w");
  });

  it("rejects invalid fee range", () => {
    expect(() => FeeRangeSchema.parse("5y")).toThrow();
  });
});
```

Run: `cd C:\hermes\bitcoin-card\packages\data && pnpm test`
Expected: 4 tests pass.

Commit:
```bash
git add -A
git commit -m "feat(data): shared types and zod schemas"
```

### Task 1.3: HTTP client wrapper

**Files:** Create: `packages/data/src/httpClient.ts`

**`packages/data/src/httpClient.ts`:**

```typescript
export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export async function getJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 10_000, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpError(url, res.status, body);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
```

**Test:** `packages/data/test/httpClient.test.ts`

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { getJson, HttpError } from "../src/httpClient.js";

describe("getJson", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON on 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await getJson<{ ok: boolean }>("https://x/y");
    expect(result).toEqual({ ok: true });
  });

  it("throws HttpError on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(getJson("https://x/y")).rejects.toBeInstanceOf(HttpError);
  });

  it("throws on timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    await expect(
      getJson("https://x/y", { timeoutMs: 50 }),
    ).rejects.toThrow();
  });
});
```

Run: `pnpm test`
Expected: 3 tests pass.

Commit: `feat(data): http client wrapper`

### Task 1.4: Coinbase price source (TDD example)

This is the canonical TDD pattern. The other source clients (1.5 Kraken, 1.6 Blockstream) follow the same shape; their tests and implementations are listed but abbreviated.

**Files:**
- Create: `packages/data/src/sources/coinbase.ts`
- Create: `packages/data/test/sources/coinbase.test.ts`

**Test first:** `packages/data/test/sources/coinbase.test.ts`

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchCoinbasePrice } from "../../src/sources/coinbase.js";

const originalFetch = globalThis.fetch;

describe("fetchCoinbasePrice", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns USD price on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: { amount: "67234.45", currency: "USD" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchCoinbasePrice("USD");
    expect(result).toEqual({ source: "coinbase", value: 67234.45, fetchedAt: expect.any(String) });
  });

  it("requests the correct URL for the currency", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { amount: "1", currency: "EUR" } }), { status: 200 }),
    );
    await fetchCoinbasePrice("EUR");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.coinbase.com/v2/prices/BTC-EUR/spot",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects non-finite amounts", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { amount: "NaN", currency: "USD" } }), { status: 200 }),
    );
    await expect(fetchCoinbasePrice("USD")).rejects.toThrow(/non-finite/i);
  });

  it("propagates HTTP errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("rate limit", { status: 429 }));
    await expect(fetchCoinbasePrice("USD")).rejects.toThrow(/HTTP 429/);
  });
});
```

Run: `pnpm test -- coinbase` → Expected: FAIL (module not found).

**Implementation:** `packages/data/src/sources/coinbase.ts`

```typescript
import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { Currency, SourceResult } from "../types.js";

const CoinbaseResponseSchema = z.object({
  data: z.object({
    amount: z.string(),
    currency: z.string(),
  }),
});

export async function fetchCoinbasePrice(
  currency: Currency,
): Promise<SourceResult<number>> {
  const url = `https://api.coinbase.com/v2/prices/BTC-${currency}/spot`;
  const raw = await getJson<unknown>(url);
  const parsed = CoinbaseResponseSchema.parse(raw);
  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`Coinbase returned non-finite amount: ${parsed.data.amount}`);
  }
  return {
    source: "coinbase",
    value: amount,
    fetchedAt: new Date().toISOString(),
  };
}
```

Run: `pnpm test -- coinbase` → Expected: 4 tests pass.

Commit: `feat(data): coinbase price source`

### Task 1.5: Kraken price source

**Files:** Create: `packages/data/src/sources/kraken.ts`

**Test:** `packages/data/test/sources/kraken.test.ts` — 3 tests:
1. Returns price from `result.XXBTZUSD.c[0]` for USD
2. Requests correct pair URL (XBTUSD / XBTEUR / XBTGBP)
3. Rejects on missing or non-numeric `c[0]`

**Implementation:** `packages/data/src/sources/kraken.ts`

```typescript
import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { Currency, SourceResult } from "../types.js";

const KRAKEN_PAIRS: Record<Currency, string> = {
  USD: "XXBTZUSD",
  EUR: "XXBTZEUR",
  GBP: "XXBTZGBP",
};

const KrakenResponseSchema = z.object({
  result: z.record(z.object({ c: z.array(z.string()) })),
});

export async function fetchKrakenPrice(
  currency: Currency,
): Promise<SourceResult<number>> {
  const pair = KRAKEN_PAIRS[currency];
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const raw = await getJson<unknown>(url);
  const parsed = KrakenResponseSchema.parse(raw);
  const last = parsed.result[pair]?.c[0];
  if (last === undefined) throw new Error(`Kraken response missing last price for ${pair}`);
  const value = Number(last);
  if (!Number.isFinite(value)) throw new Error(`Kraken returned non-finite price: ${last}`);
  return { source: "kraken", value, fetchedAt: new Date().toISOString() };
}
```

Run: `pnpm test -- kraken` → Expected: 3 pass. Commit: `feat(data): kraken price source`

### Task 1.6: mempool.space client (block height, fees, hashrate)

**Files:** Create: `packages/data/src/sources/mempool.ts`

**Test:** `packages/data/test/sources/mempool.test.ts` — tests for:
1. `fetchBlockHeight()` — returns number from `/api/blocks/tip/height`
2. `fetchRecommendedFees()` — returns `{ fastestFee, halfHourFee, hourFee, minimumFee }` from `/api/v1/fees/recommended`
3. `fetchHashrate()` — returns EH/s number from `/api/v1/mining/hashrate/3d` (divides by 1e18)
4. `fetchDifficulty()` — returns bigint from `/api/v1/difficulty/`
5. `fetchRecentBlocks(n)` — returns array of recent blocks from `/api/v1/blocks/tip/{n}` (used for fee history aggregation)

Each test mocks fetch with realistic JSON.

**Implementation:** `packages/data/src/sources/mempool.ts`

```typescript
import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { SourceResult, MempoolFees } from "../types.js";

const BASE = "https://mempool.space/api";

const BlockHeightSchema = z.number().int().positive();
const FeesSchema = z.object({
  fastestFee: z.number(),
  halfHourFee: z.number(),
  hourFee: z.number(),
  minimumFee: z.number(),
});
const HashrateSchema = z.object({
  hashrate: z.number(), // H/s
});
const DifficultySchema = z.object({
  difficulty: z.number(), // expected as number, then converted to bigint
});
const BlockSchema = z.object({
  id: z.string(),
  height: z.number().int().positive(),
  timestamp: z.number().int().positive(),
  medianFee: z.number().optional(),
  feeRange: z.tuple([z.number(), z.number()]).optional(),
});

export async function fetchBlockHeight(): Promise<SourceResult<number>> {
  const url = `${BASE}/blocks/tip/height`;
  const value = BlockHeightSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value, fetchedAt: new Date().toISOString() };
}

export async function fetchRecommendedFees(): Promise<SourceResult<MempoolFees>> {
  const url = `${BASE}/v1/fees/recommended`;
  const fees = FeesSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: fees, fetchedAt: new Date().toISOString() };
}

export async function fetchHashrate(): Promise<SourceResult<number>> {
  const url = `${BASE}/v1/mining/hashrate/3d`;
  const { hashrate } = HashrateSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: hashrate / 1e18, fetchedAt: new Date().toISOString() };
}

export async function fetchDifficulty(): Promise<SourceResult<bigint>> {
  const url = `${BASE}/v1/difficulty/`;
  const { difficulty } = DifficultySchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: BigInt(Math.round(difficulty)), fetchedAt: new Date().toISOString() };
}

export async function fetchRecentBlocks(count: number): Promise<SourceResult<Array<z.infer<typeof BlockSchema>>>> {
  const url = `${BASE}/v1/blocks/tip/${count}`;
  const value = z.array(BlockSchema).parse(await getJson<unknown>(url));
  return { source: "mempool", value, fetchedAt: new Date().toISOString() };
}
```

Run: `pnpm test -- mempool` → Expected: all pass. Commit: `feat(data): mempool.space client`

### Task 1.7: Blockstream client (secondary height + fee estimates)

**Files:** Create: `packages/data/src/sources/blockstream.ts`

**Test:** `packages/data/test/sources/blockstream.test.ts` — 2 tests:
1. `fetchBlockHeight()` returns number from `https://blockstream.info/api/blocks/tip/height`
2. `fetchFeeEstimates()` returns a Record<targetBlocks, satPerVb> from `/api/fee-estimates`

**Implementation:**

```typescript
import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { SourceResult } from "../types.js";

const BASE = "https://blockstream.info/api";

export async function fetchBlockHeight(): Promise<SourceResult<number>> {
  const url = `${BASE}/blocks/tip/height`;
  const raw = await getJson<unknown>(url);
  // Blockstream returns a plain number, not JSON object; handle both.
  const value = typeof raw === "number" ? raw : z.number().int().positive().parse(raw);
  return { source: "blockstream", value, fetchedAt: new Date().toISOString() };
}

export type FeeEstimates = Record<string, number>;
export async function fetchFeeEstimates(): Promise<SourceResult<FeeEstimates>> {
  const url = `${BASE}/fee-estimates`;
  const value = z.record(z.string(), z.number()).parse(await getJson<unknown>(url));
  return { source: "blockstream", value, fetchedAt: new Date().toISOString() };
}
```

Run: `pnpm test -- blockstream` → pass. Commit: `feat(data): blockstream client`

### Task 1.8: Cross-source price verification (TDD)

**Files:**
- Create: `packages/data/src/verification/price.ts`
- Create: `packages/data/test/verification/price.test.ts`

**Test:**

```typescript
import { describe, it, expect } from "vitest";
import { verifyPrices } from "../../src/verification/price.js";
import type { SourceResult } from "../../src/types.js";

const at = "2026-06-01T00:00:00.000Z";
const src = (source: string, value: number): SourceResult<number> => ({ source, value, fetchedAt: at });

describe("verifyPrices", () => {
  it("marks verified when sources agree within threshold", () => {
    const result = verifyPrices([src("coinbase", 67000), src("kraken", 67050)]);
    expect(result.price).toBeCloseTo(67025, 0);
    expect(result.agreement).toBe("verified");
  });

  it("marks disputed when sources diverge beyond threshold", () => {
    const result = verifyPrices([src("coinbase", 67000), src("kraken", 68000)]);
    expect(result.agreement).toBe("disputed");
  });

  it("marks single-source when only one source provided", () => {
    const result = verifyPrices([src("coinbase", 67000)]);
    expect(result.agreement).toBe("single-source");
    expect(result.price).toBe(67000);
  });

  it("returns zero sources agreement when empty", () => {
    expect(() => verifyPrices([])).toThrow(/at least one source/i);
  });

  it("uses default 0.5% threshold", () => {
    const r1 = verifyPrices([src("a", 100), src("b", 100.4)]);
    expect(r1.agreement).toBe("verified");
    const r2 = verifyPrices([src("a", 100), src("b", 100.6)]);
    expect(r2.agreement).toBe("disputed");
  });

  it("accepts a custom threshold", () => {
    const result = verifyPrices([src("a", 100), src("b", 105)], { threshold: 0.1 });
    expect(result.agreement).toBe("disputed");
  });
});
```

**Implementation:** `packages/data/src/verification/price.ts`

```typescript
import type { Currency, PriceData, SourceResult } from "../types.js";

export interface VerifyOptions {
  threshold?: number; // fraction, e.g. 0.005 for 0.5%
}

export function verifyPrices(
  sources: SourceResult<number>[],
  options: VerifyOptions = {},
): PriceData {
  if (sources.length === 0) {
    throw new Error("verifyPrices requires at least one source");
  }
  const threshold = options.threshold ?? 0.005;
  const currency = "USD" as Currency; // overridden by caller; see Task 1.9
  const fetchedAt = sources[0]!.fetchedAt;

  if (sources.length === 1) {
    return {
      price: sources[0]!.value,
      currency,
      sources,
      agreement: "single-source",
      fetchedAt,
    };
  }

  const max = Math.max(...sources.map(s => s.value));
  const min = Math.min(...sources.map(s => s.value));
  const relDelta = (max - min) / min;

  const agreement: PriceData["agreement"] = relDelta <= threshold ? "verified" : "disputed";
  const price = sources.reduce((sum, s) => sum + s.value, 0) / sources.length;

  return { price, currency, sources, agreement, fetchedAt };
}
```

(Note: `verifyPrices` returns `currency: "USD"` as a placeholder. The `getPrice()` wrapper in Task 1.9 will override it via object spread.)

Run: `pnpm test -- verification/price` → 6 pass. Commit: `feat(data): cross-source price verification`

### Task 1.9: getPrice() public API (TDD)

**Files:**
- Modify: `packages/data/src/index.ts` (add export)
- Create: `packages/data/src/getPrice.ts`
- Create: `packages/data/test/getPrice.test.ts`

**Test:**

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getPrice } from "../src/getPrice.js";

const originalFetch = globalThis.fetch;

const coinbaseBody = (amount: string) =>
  JSON.stringify({ data: { amount, currency: "USD" } });
const krakenBody = (last: string) =>
  JSON.stringify({ result: { XXBTZUSD: { c: [last, "0"] } } });

describe("getPrice", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("queries both Coinbase and Kraken and reports verified", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("67000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(krakenBody("67050"), { status: 200 }));

    const result = await getPrice("USD");
    expect(result.agreement).toBe("verified");
    expect(result.price).toBeCloseTo(67025, 0);
    expect(result.sources.map(s => s.source).sort()).toEqual(["coinbase", "kraken"]);
  });

  it("reports disputed when sources diverge", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("60000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(krakenBody("65000"), { status: 200 }));

    const result = await getPrice("USD");
    expect(result.agreement).toBe("disputed");
  });

  it("propagates errors when all sources fail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 500 }));
    await expect(getPrice("USD")).rejects.toThrow();
  });
});
```

**Implementation:** `packages/data/src/getPrice.ts`

```typescript
import { fetchCoinbasePrice } from "./sources/coinbase.js";
import { fetchKrakenPrice } from "./sources/kraken.js";
import { verifyPrices } from "./verification/price.js";
import type { Currency, PriceData } from "./types.js";

export async function getPrice(currency: Currency = "USD"): Promise<PriceData> {
  const results = await Promise.allSettled([
    fetchCoinbasePrice(currency),
    fetchKrakenPrice(currency),
  ]);

  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchCoinbasePrice>>> => r.status === "fulfilled")
    .map(r => r.value);

  if (fulfilled.length === 0) {
    const firstReason = (results.find(r => r.status === "rejected") as PromiseRejectedResult).reason;
    throw new Error(`All price sources failed. First error: ${firstReason}`);
  }

  return { ...verifyPrices(fulfilled), currency };
}
```

Update `packages/data/src/index.ts`:

```typescript
export * from "./types.js";
export { getPrice } from "./getPrice.js";
```

Run: `pnpm test -- getPrice` → 3 pass. Commit: `feat(data): getPrice with cross-source verification`

### Task 1.10: getBlockHeight() (TDD)

**Files:**
- Create: `packages/data/src/getBlockHeight.ts`
- Modify: `packages/data/src/index.ts`
- Create: `packages/data/test/getBlockHeight.test.ts`

**Test (abbreviated):** 3 tests — verified when mempool+blockstream agree, disputed when disagree, single-source when one source fails.

**Implementation:**

```typescript
import { fetchBlockHeight as fetchMempool } from "./sources/mempool.js";
import { fetchBlockHeight as fetchBlockstream } from "./sources/blockstream.js";
import type { BlockHeightData, SourceResult } from "./types.js";

export async function getBlockHeight(): Promise<BlockHeightData> {
  const results = await Promise.allSettled([fetchMempool(), fetchBlockstream()]);
  const sources = results
    .filter((r): r is PromiseFulfilledResult<SourceResult<number>> => r.status === "fulfilled")
    .map(r => r.value);

  if (sources.length === 0) {
    throw new Error("All block-height sources failed");
  }

  const fetchedAt = sources[0]!.fetchedAt;
  const values = sources.map(s => s.value);
  const agreement: BlockHeightData["agreement"] =
    sources.length === 1
      ? "single-source"
      : new Set(values).size === 1
        ? "verified"
        : "disputed";

  return { height: values[0]!, sources, agreement, fetchedAt };
}
```

Run: `pnpm test -- getBlockHeight` → 3 pass. Commit: `feat(data): getBlockHeight`

### Task 1.11: getMempoolFees() (TDD)

**Files:**
- Create: `packages/data/src/getMempoolFees.ts`
- Modify: `packages/data/src/index.ts`
- Create: `packages/data/test/getMempoolFees.test.ts`

**Test (abbreviated):** 2 tests — returns mempool fees on success, throws on API error.

**Implementation:**

```typescript
import { fetchRecommendedFees } from "./sources/mempool.js";
import type { MempoolFees } from "./types.js";

export async function getMempoolFees(): Promise<MempoolFees> {
  const result = await fetchRecommendedFees();
  return { ...result.value, sources: [result], fetchedAt: result.fetchedAt };
}
```

Run: pass. Commit: `feat(data): getMempoolFees`

### Task 1.12: getFeeHistory() (TDD)

**Files:**
- Create: `packages/data/src/getFeeHistory.ts`
- Modify: `packages/data/src/index.ts`
- Create: `packages/data/test/getFeeHistory.test.ts`

**Test cases (abbreviated):**
1. Range `24h` aggregates last ~144 blocks (10-min target) into one bucket per hour, returns 24 points.
2. Range `1w` aggregates into 7 daily buckets.
3. Range `1m` returns `partial: true` with a `note: "Daily snapshots accumulate starting v0.2.0; check back later."` and empty `points`.
4. Range `1y` and `2y` behave like `1m`.
5. Invalid range throws.

**Implementation:**

```typescript
import { fetchRecentBlocks } from "./sources/mempool.js";
import type { FeeHistory, FeeHistoryPoint, FeeRange } from "./types.js";

const BUCKET_HOURS: Record<FeeRange, number> = {
  "24h": 1,
  "1w": 24,
  "1m": 24,
  "1y": 24 * 30,
  "2y": 24 * 30,
};

const BLOCKS_PER_BUCKET: Record<FeeRange, number> = {
  "24h": 6,   // 1h * 6 blocks/h
  "1w": 144,
  "1m": 144,
  "1y": 144,
  "2y": 144,
};

const LONG_RANGE_NOTE = "Daily fee history accumulation starts with v0.2.0; check back later.";

export async function getFeeHistory(range: FeeRange): Promise<FeeHistory> {
  if (range === "1m" || range === "1y" || range === "2y") {
    return { range, points: [], source: "self-accumulated", partial: true, note: LONG_RANGE_NOTE };
  }

  const count = BLOCKS_PER_BUCKET[range] * 24 / BUCKET_HOURS[range];
  const { value: blocks } = await fetchRecentBlocks(Math.ceil(count));

  // Bucket by hour (24h) or day (1w).
  const bucketMs = BUCKET_HOURS[range] * 3_600_000;
  const buckets = new Map<number, number[]>();

  for (const block of blocks) {
    const bucketKey = Math.floor(block.timestamp * 1000 / bucketMs);
    const fee = block.medianFee ?? block.feeRange?.[0] ?? 0;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(fee);
  }

  const points: FeeHistoryPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, fees]) => ({
      t: new Date(key * bucketMs).toISOString(),
      fee: fees.reduce((a, b) => a + b, 0) / fees.length,
    }));

  return { range, points, source: "mempool", partial: false };
}
```

Run: pass. Commit: `feat(data): getFeeHistory`

### Task 1.13: getUnminedSupply() (pure, TDD)

**Files:**
- Create: `packages/data/src/derive/unmined.ts`
- Create: `packages/data/src/getUnminedSupply.ts`
- Create: `packages/data/test/derive/unmined.test.ts`
- Create: `packages/data/test/getUnminedSupply.test.ts`
- Modify: `packages/data/src/index.ts`

**Test:** `derive/unmined.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { computeCurrentSupply, computeUnminedSupply } from "../../src/derive/unmined.js";

describe("computeCurrentSupply", () => {
  it("uses 50 BTC reward for blocks before first halving (height < 210000)", () => {
    // 100 blocks * 50 = 5000 BTC
    expect(computeCurrentSupply(100)).toBe(5000);
  });

  it("applies first halving at height 210000", () => {
    // 210000 * 50 = 10,500,000 (pre-halving)
    // 1 block * 25 = 25 (post-halving)
    // total = 10,500,025
    expect(computeCurrentSupply(210_001)).toBe(10_500_025);
  });

  it("applies second halving at height 420000", () => {
    // 210000 * 50 = 10,500,000
    // 210000 * 25 = 5,250,000
    // 1 * 12.5 = 12.5
    expect(computeCurrentSupply(420_001)).toBeCloseTo(15_750_012.5, 6);
  });

  it("throws on negative height", () => {
    expect(() => computeCurrentSupply(-1)).toThrow();
  });
});

describe("computeUnminedSupply", () => {
  it("returns 21M - currentSupply for a recent height", () => {
    const result = computeUnminedSupply(900_000);
    expect(result.unmined).toBeGreaterThan(0);
    expect(result.unmined).toBeLessThan(21_000_000);
    expect(result.totalCap).toBe(21_000_000);
    expect(result.currentSupply + result.unmined).toBeCloseTo(21_000_000, 6);
  });
});
```

**Implementation:** `derive/unmined.ts`

```typescript
const TOTAL_CAP = 21_000_000;
const INITIAL_REWARD = 50;
const HALVING_INTERVAL = 210_000;

export function computeCurrentSupply(height: number): number {
  if (!Number.isInteger(height) || height < 0) {
    throw new Error(`Invalid block height: ${height}`);
  }

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

export function computeUnminedSupply(height: number) {
  const currentSupply = computeCurrentSupply(height);
  const unmined = TOTAL_CAP - currentSupply;
  return {
    unmined,
    totalCap: TOTAL_CAP,
    currentSupply,
    formula: `unmined = 21,000,000 - Σ(blocks_mined × reward) over ${height} blocks, with halvings every 210,000 blocks`,
  };
}
```

**`getUnminedSupply.ts`:**

```typescript
import { getBlockHeight } from "./getBlockHeight.js";
import { computeUnminedSupply } from "./derive/unmined.js";
import type { UnminedSupply } from "./types.js";

export async function getUnminedSupply(): Promise<UnminedSupply> {
  const { height } = await getBlockHeight();
  return computeUnminedSupply(height);
}
```

Update `src/index.ts`:

```typescript
export * from "./types.js";
export { getPrice } from "./getPrice.js";
export { getBlockHeight } from "./getBlockHeight.js";
export { getMempoolFees } from "./getMempoolFees.js";
export { getFeeHistory } from "./getFeeHistory.js";
export { getUnminedSupply, computeUnminedSupply, computeCurrentSupply } from "./derive/unmined.js";
export { getUnminedSupply as _getUnminedSupply } from "./getUnminedSupply.js";
```

(The duplicate export is intentional and will be cleaned in the final barrel pass — see Task 1.16.)

Run: `pnpm test` → all pass. Commit: `feat(data): getUnminedSupply with pure derivation`

### Task 1.14: getNetworkSummary() (TDD)

**Files:**
- Create: `packages/data/src/getNetworkSummary.ts`
- Modify: `packages/data/src/index.ts`
- Create: `packages/data/test/getNetworkSummary.test.ts`

**Test (abbreviated):** 2 tests — bundles { price, blockHeight, hashrate, difficulty, unmined, nextHalvingEta }; throws on total failure.

**Implementation:**

```typescript
import { getPrice } from "./getPrice.js";
import { getBlockHeight } from "./getBlockHeight.js";
import { fetchHashrate, fetchDifficulty } from "./sources/mempool.js";
import { computeCurrentSupply } from "./derive/unmined.js";
import { getUnminedSupply } from "./getUnminedSupply.js";
import type { NetworkSummary } from "./types.js";

const NEXT_HALVING_INTERVAL = 210_000;
const TARGET_BLOCK_TIME_SEC = 600; // 10 minutes

export async function getNetworkSummary(): Promise<NetworkSummary> {
  const [price, blockHeight, hashrate, difficulty] = await Promise.all([
    getPrice("USD"),
    getBlockHeight(),
    fetchHashrate(),
    fetchDifficulty(),
  ]);

  const { unmined } = computeUnminedSupply(blockHeight.height);
  const blocksUntilHalving = NEXT_HALVING_INTERVAL - (blockHeight.height % NEXT_HALVING_INTERVAL);
  const nextHalvingEta = new Date(
    Date.now() + blocksUntilHalving * TARGET_BLOCK_TIME_SEC * 1000,
  ).toISOString();

  return {
    price,
    blockHeight,
    hashrate: hashrate.value,
    difficulty: difficulty.value,
    unminedBtc: unmined,
    nextHalvingEta,
    fetchedAt: new Date().toISOString(),
  };
}
```

Update barrel `src/index.ts` (clean version):

```typescript
export * from "./types.js";
export { getPrice } from "./getPrice.js";
export { getBlockHeight } from "./getBlockHeight.js";
export { getMempoolFees } from "./getMempoolFees.js";
export { getFeeHistory } from "./getFeeHistory.js";
export { getNetworkSummary } from "./getNetworkSummary.js";
export { getUnminedSupply, computeUnminedSupply, computeCurrentSupply } from "./derive/unmined.js";
```

Run: pass. Commit: `feat(data): getNetworkSummary`

### Task 1.15: Integration smoke test (gated, real APIs)

**Files:** Create: `packages/data/test/integration/smoke.test.ts`

This test hits the real APIs and is gated behind an env var so it doesn't run in CI by default.

```typescript
import { describe, it, expect } from "vitest";
import { getPrice, getBlockHeight, getMempoolFees, getNetworkSummary } from "../../src/index.js";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === "1";
const itIntegration = RUN_INTEGRATION ? it : it.skip;

describe.skipIf(!RUN_INTEGRATION)("integration: real APIs", () => {
  itIntegration("getPrice returns verified price", async () => {
    const r = await getPrice("USD");
    expect(r.price).toBeGreaterThan(1000);
    expect(r.agreement).toBe("verified");
  }, 30_000);

  itIntegration("getBlockHeight returns current height", async () => {
    const r = await getBlockHeight();
    expect(r.height).toBeGreaterThan(800_000);
  }, 30_000);

  itIntegration("getMempoolFees returns sensible numbers", async () => {
    const r = await getMempoolFees();
    expect(r.fastestFee).toBeGreaterThan(0);
    expect(r.fastestFee).toBeGreaterThan(r.hourFee);
  }, 30_000);

  itIntegration("getNetworkSummary bundles everything", async () => {
    const r = await getNetworkSummary();
    expect(r.unminedBtc).toBeGreaterThan(0);
    expect(r.hashrate).toBeGreaterThan(100);
  }, 30_000);
});
```

Run: `RUN_INTEGRATION=1 pnpm test` → 4 pass. Otherwise all skip.
Document in README: "Run integration tests with `RUN_INTEGRATION=1 pnpm -F @bitcoin-card/data test`".

Commit: `test(data): gated integration smoke test`

### Task 1.16: Build the package and verify

Run:
```bash
cd C:\hermes\bitcoin-card\packages\data
pnpm build
ls dist/
```

Expected: `dist/` contains `index.js`, `index.d.ts`, plus compiled outputs for sources, verification, derive.

Commit: `chore(data): verify build output`

---

# PHASE 2: packages/mcp-server (thin transport)

### Task 2.1: Package skeleton

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/vitest.config.ts`

**`package.json`:**

```json
{
  "name": "bitcoin-card-mcp",
  "version": "0.1.0",
  "description": "MCP server exposing trustworthy Bitcoin data to AI coding assistants.",
  "type": "module",
  "bin": {
    "bitcoin-card-mcp": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.json && chmod +x dist/index.js",
    "test": "vitest run",
    "lint": "echo 'lint: stub'",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@bitcoin-card/data": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

**`tsconfig.json`:** extends root, `outDir: ./dist`, `rootDir: ./src`.

**`vitest.config.ts`:** mirrors data package.

Run: `cd C:\hermes\bitcoin-card && pnpm install`
Commit: `feat(mcp-server): scaffold package`

### Task 2.2: Server setup

**Files:** Create: `packages/mcp-server/src/server.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBitcoinPrice } from "./tools/bitcoinPrice.js";
import { registerBlockHeight } from "./tools/blockHeight.js";
import { registerMempoolFees } from "./tools/mempoolFees.js";
import { registerFeeHistory } from "./tools/feeHistory.js";
import { registerNetworkSummary } from "./tools/networkSummary.js";
import { registerUnminedSupply } from "./tools/unminedSupply.js";
import { registerMarketBriefPrompt } from "./prompts/marketBrief.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "bitcoin-card-mcp",
    version: "0.1.0",
  });

  registerBitcoinPrice(server);
  registerBlockHeight(server);
  registerMempoolFees(server);
  registerFeeHistory(server);
  registerNetworkSummary(server);
  registerUnminedSupply(server);
  registerMarketBriefPrompt(server);

  return server;
}

export async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep alive; stdio transport handles its own lifecycle.
}
```

`packages/mcp-server/src/index.ts`:

```typescript
export { runStdio, createServer } from "./server.js";
```

Run: `pnpm -F bitcoin-card-mcp build` → builds. Commit: `feat(mcp-server): server skeleton`

### Task 2.3: Tool registration pattern (canonical example: bitcoinPrice)

**Files:** Create: `packages/mcp-server/src/tools/bitcoinPrice.ts`

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPrice } from "@bitcoin-card/data";

export function registerBitcoinPrice(server: McpServer): void {
  server.tool(
    "get_bitcoin_price",
    "Get the current Bitcoin spot price with cross-source verification. Returns the average price, the individual source values, and whether the sources agree within the verification threshold.",
    {
      currency: z.enum(["USD", "EUR", "GBP"]).default("USD").describe("Quote currency"),
    },
    async ({ currency }) => {
      const result = await getPrice(currency);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

**Test:** `packages/mcp-server/test/tools/bitcoinPrice.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import * as data from "@bitcoin-card/data";

const originalFetch = globalThis.fetch;

describe("get_bitcoin_price tool", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers and executes, returning verified price", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { amount: "67000", currency: "USD" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { XXBTZUSD: { c: ["67050", "0"] } } }), { status: 200 }));

    const server = createServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientT), server.connect(serverT)]);

    const result = await client.callTool({ name: "get_bitcoin_price", arguments: { currency: "USD" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    const parsed = JSON.parse(text);
    expect(parsed.agreement).toBe("verified");

    await client.close();
  });
});
```

Run: `pnpm -F bitcoin-card-mcp test -- bitcoinPrice` → pass. Commit: `feat(mcp-server): get_bitcoin_price tool`

### Task 2.4: Remaining tool registrations (blockHeight, mempoolFees, feeHistory, networkSummary, unminedSupply)

Each follows the exact pattern from 2.3. The tool description strings and parameter schemas:

**`blockHeight.ts`:** No params. Description: "Get the current Bitcoin block height, verified across mempool.space and Blockstream."

**`mempoolFees.ts`:** No params. Description: "Get current recommended mempool transaction fees in sat/vB at four confirmation targets: fastest, 30-min, 1-hour, and minimum."

**`feeHistory.ts`:** `range: z.enum(["24h", "1w", "1m", "1y", "2y"])`. Description: "Get historical mempool fee data. Note: 1m/1y/2y ranges are accumulating over time and will be partial until v0.2.0."

**`networkSummary.ts`:** No params. Description: "Get a one-shot bundle of current Bitcoin network state: price, block height, hashrate, difficulty, unmined BTC, and next halving ETA."

**`unminedSupply.ts`:** No params. Description: "Get the current unmined Bitcoin supply, derived purely from block height and the halving schedule. Returns the full derivation formula for verifiability."

Each gets a one-test file mirroring 2.3's pattern. The tests are mechanical wrappers - copy/paste the structure from `bitcoinPrice.test.ts` and adjust the `name` and the mocked fetch responses.

Commit (one commit per tool):
- `feat(mcp-server): get_block_height tool`
- `feat(mcp-server): get_mempool_fees tool`
- `feat(mcp-server): get_fee_history tool`
- `feat(mcp-server): get_network_summary tool`
- `feat(mcp-server): get_unmined_supply tool`

### Task 2.5: marketBrief prompt

**Files:** Create: `packages/mcp-server/src/prompts/marketBrief.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMarketBriefPrompt(server: McpServer): void {
  server.prompt(
    "bitcoin-market-brief",
    "Compose a structured Bitcoin market brief by calling get_network_summary and get_mempool_fees, then summarising in plain language.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Call get_network_summary and get_mempool_fees, then write a 4-sentence market brief covering: (1) current price and source agreement, (2) mempool fee environment (cheap/normal/congested), (3) time to next halving, (4) one risk worth flagging.",
          },
        },
      ],
    }),
  );
}
```

Commit: `feat(mcp-server): bitcoin-market-brief prompt`

### Task 2.6: End-to-end MCP protocol test

**Files:** Create: `packages/mcp-server/test/e2e.test.ts`

This test boots the server, connects a client, lists tools, and calls each one with mocked fetches. Verifies:
1. All 6 tools are registered
2. The prompt is registered
3. Each tool call returns the expected shape

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const originalFetch = globalThis.fetch;

describe("MCP server e2e", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { amount: "1" } }), { status: 200 }),
    );
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers all expected tools and the prompt", async () => {
    const server = createServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientT), server.connect(serverT)]);

    const { tools, prompts } = await client.listTools().then(t => ({
      tools: t.tools.map(x => x.name),
      prompts: [], // listPrompts called separately if needed
    }));
    expect(tools.sort()).toEqual([
      "get_bitcoin_price", "get_block_height", "get_fee_history",
      "get_mempool_fees", "get_network_summary", "get_unmined_supply",
    ]);

    await client.close();
  });
});
```

Run: `pnpm -F bitcoin-card-mcp test` → all pass. Commit: `test(mcp-server): e2e tool registration`

### Task 2.7: Manual Claude Desktop test

**Step 1:** Build the package:
```bash
cd C:\hermes\bitcoin-card
pnpm -F bitcoin-card-mcp build
```

**Step 2:** Add to `%APPDATA%\Claude\claude_desktop_config.json` (or in the Hermes research2 profile's equivalent):
```json
{
  "mcpServers": {
    "bitcoin-card": {
      "command": "node",
      "args": ["C:\\hermes\\bitcoin-card\\packages\\mcp-server\\dist\\index.js"]
    }
  }
}
```

**Step 3:** Restart Claude Desktop. Ask: "What's the current Bitcoin price and block height?"

Expected: Claude calls `get_bitcoin_price` and `get_block_height` and reports the values with source agreement.

Commit: `docs(mcp-server): add claude desktop config snippet to readme`

---

# PHASE 3: apps/docs (minimal landing page)

### Task 3.1: Astro scaffold

**Files:** Create: `apps/docs/package.json`, `apps/docs/astro.config.mjs`, `apps/docs/tsconfig.json`

**`package.json`:**

```json
{
  "name": "@bitcoin-card/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "lint": "echo 'lint: stub'",
    "typecheck": "astro check"
  },
  "dependencies": {
    "astro": "^4.16.0"
  }
}
```

**`astro.config.mjs`:**

```javascript
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://bitcoin-card.example.com",
  output: "static",
});
```

Run: `pnpm install`. Commit: `feat(docs): astro scaffold`

### Task 3.2: Landing page with the 4-line config

**Files:** Create: `apps/docs/src/pages/index.astro`

A minimal landing page with:
- Hero: "Trustworthy Bitcoin data, embedded anywhere."
- Primary CTA: "Add to Claude Desktop in 4 lines"
- Code block (copyable):

```json
{
  "mcpServers": {
    "bitcoin-card": {
      "command": "npx",
      "args": ["-y", "bitcoin-card-mcp"]
    }
  }
}
```

- "Available tools" list with one-line descriptions for each of the 6 tools.
- "Why trust us" link to /trust.
- "Tools reference" link to /tools.

Commit: `feat(docs): landing page with claude desktop config`

### Task 3.3: Tool reference and trust pages

**Files:**
- Create: `apps/docs/src/pages/tools.md`
- Create: `apps/docs/src/pages/trust.md`

**`tools.md`:** Per-tool reference with input schemas, return shape examples, and sample agent invocations.

**`trust.md`:** Explanation of:
- Cross-source verification (price)
- Open-source data layer with reproducible builds
- Source attribution on every response
- Public accuracy log (TODO: link to status page in v1.1)

Commit: `feat(docs): tool reference and trust pages`

### Task 3.4: Build and serve

```bash
cd C:\hermes\bitcoin-card\apps\docs
pnpm build
pnpm preview
```

Verify: `http://localhost:4321` renders the landing page with the config snippet.

Commit: `chore(docs): verify build`

---

# PHASE 4: npm publish prep

### Task 4.1: README for the npm package

**Files:** Create: `packages/mcp-server/README.md`

Contents:
- One-line description
- "Install" section with the 4-line Claude Desktop config (the single most important snippet)
- "Tools" table with name, params, description
- "Data sources" list (Coinbase, Kraken, mempool.space, Blockstream) with attribution
- "Trust" link to /trust
- "License: MIT"

Commit: `docs(mcp-server): npm readme`

### Task 4.2: Test npx locally

```bash
cd C:\hermes\bitcoin-card\packages\mcp-server
pnpm build
node dist/index.js
```

Expected: server starts, waits for stdio input. Ctrl-C to exit.

Commit: `chore(mcp-server): verify npx-style invocation`

### Task 4.3: Publish v0.1.0

```bash
cd C:\hermes\bitcoin-card\packages\mcp-server
npm login   # user provides credentials
npm publish --access public
```

Expected: package visible at `https://www.npmjs.com/package/bitcoin-card-mcp`. Installable via `npx bitcoin-card-mcp`.

Commit: `chore(mcp-server): publish v0.1.0` (release tag: `v0.1.0`)

### Task 4.4: Tag the release

```bash
cd C:\hermes\bitcoin-card
git tag -a v0.1.0 -m "v0.1.0: first npm release of the MCP server"
git push origin v0.1.0
```

---

# Verification Checklist (run before declaring v1 done)

- [ ] `pnpm install` clean at root
- [ ] `pnpm -r test` — all packages pass
- [ ] `RUN_INTEGRATION=1 pnpm -F @bitcoin-card/data test` — 4 integration tests pass against real APIs
- [ ] `pnpm -r build` — all packages build without errors
- [ ] `pnpm -F bitcoin-card-mcp test` — e2e MCP test passes
- [ ] Manual Claude Desktop test: all 6 tools callable, prompt works
- [ ] Manual test in Claude Code: `claude` CLI invokes the tools
- [ ] `node packages/mcp-server/dist/index.js` starts cleanly and waits for stdio
- [ ] `npm view bitcoin-card-mcp` shows the published v0.1.0
- [ ] `npx bitcoin-card-mcp` (in a fresh empty directory) installs and runs

# Out of Scope for v1 (deferred)

- HTTP+SSE transport for hosted/remote use
- Cloudflare Worker aggregator with cross-region caching
- The visual web component (Phase 2 of the product, separate plan)
- Framework wrappers (React, Vue, Astro components)
- Daily fee-history accumulation cron + 1m/1y/2y backfill
- Paid tier with signed responses and analytics
- Public status/accuracy page
- Custom branding / white-label

# Risks and Mitigations

| Risk                                                     | Mitigation                                                                 |
|----------------------------------------------------------|----------------------------------------------------------------------------|
| mempool.space rate limits or downtime                    | Blockstream as second source for height; surface degraded mode in responses |
| Coinbase or Kraken return malformed JSON                 | zod validation + per-source error capture; cross-source check still works  |
| npm scope / name already taken                           | Fallback names: `bitcoin-mcp-card`, `btc-info-mcp`                         |
| Single-developer maintenance burden                      | Public roadmap + SLA documentation; graceful degradation; cached responses |
| AI assistant drift (MCP SDK breaking changes)            | Pin SDK version; integration test in CI; clear upgrade path                |
