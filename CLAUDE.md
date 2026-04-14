# debugmcp

Full-stack debug MCP server — browser, backend, and database tools for Claude Code.

## Build & Test

```bash
npm install
npm run build          # tsc → dist/
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
npm run dev            # tsx watch src/index.ts
npm run typecheck      # tsc --noEmit
```

## Key Files

- `src/index.ts` — Entry point, CLI parsing, config loading
- `src/server.ts` — MCP server init, tool registration, graceful shutdown
- `src/config-loader.ts` — Config file + CLI + env var resolution
- `src/cli.ts` — Commander CLI definitions
- `src/types.ts` — Core interfaces (DatabaseDriver, TableInfo, etc.)
- `src/logger.ts` — Structured audit logging with pluggable sinks
- `src/rate-limiter.ts` — Sliding-window rate limiter

### Database
- `src/drivers/` — PostgreSQL, MySQL, SQL Server, SQLite driver implementations
- `src/tools/` — 5 MCP database tools (list_tables, get_table_schema, run_query, describe_procedure, list_schemas)
- `src/validation/` — SQL validator + dialect-specific rules

### Browser
- `src/browser/browser-manager.ts` — Playwright lifecycle
- `src/browser/browser-tools.ts` — 8 MCP browser tools

## Architecture

- **Driver abstraction**: All 4 DB engines implement `DatabaseDriver` interface
- **Dual-layer SQL security**: App-level query validation + DB-level read-only user
- **Dialect-specific validation**: MSSQL, PostgreSQL, MySQL, SQLite each have custom blocked patterns
- **Lazy driver loading**: Only loads the driver package you actually use
- **Tool namespacing**: Multi-DB mode auto-prefixes tools (e.g., `app_list_tables`)
- **Audit logging**: Every tool call logged with timing, query, result metadata
- **Rate limiting**: Sliding window, 60 req/min default

## Testing

- Tests in `__tests__/unit/` — validator (73), logger, rate-limiter, config, tools
- Run `npm test` before committing
