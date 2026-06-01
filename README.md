# Bitcoin Card

Trustworthy Bitcoin data, embedded anywhere.

## v1: Agent Channel (MCP Server)

See `packages/mcp-server/`.

The MCP server is the v1 surface of the Bitcoin Card product. The future visual
widget (v2) will share the same data layer (`packages/data`).

## Status

🚧 v0.1.0 in development.

## Tooling

- TypeScript 5.5+, strict, ESM
- pnpm workspaces + Turborepo
- Vitest + msw for tests
- @modelcontextprotocol/sdk for the MCP transport
- zod for runtime validation

## Quick start

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Architecture

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

## License

MIT - see `LICENSE`.
