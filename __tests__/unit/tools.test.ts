import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearLogSinks, addLogSink, type AuditEntry } from "../../src/logger.js";
import { resetRateLimiter, configureRateLimiter } from "../../src/rate-limiter.js";
import type { DatabaseDriver } from "../../src/types.js";

// Shared mock driver factory
function createMockDriver(overrides: Partial<DatabaseDriver> = {}): DatabaseDriver {
  return {
    driverName: "mock",
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTables: vi.fn().mockResolvedValue([
      { schema: "public", name: "users", rowCount: 100 },
      { schema: "public", name: "orders", rowCount: 500 },
    ]),
    getTableSchema: vi.fn().mockResolvedValue([
      { name: "id", dataType: "int", maxLength: null, isNullable: false, defaultValue: null, isPrimaryKey: true, foreignKeyTable: null, foreignKeyColumn: null },
      { name: "name", dataType: "varchar", maxLength: 100, isNullable: true, defaultValue: null, isPrimaryKey: false, foreignKeyTable: null, foreignKeyColumn: null },
    ]),
    runQuery: vi.fn().mockResolvedValue({
      columns: ["id", "name"],
      rows: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      rowCount: 2,
      truncated: false,
    }),
    describeProcedure: vi.fn().mockResolvedValue({
      name: "get_user",
      parameters: [{ name: "user_id", dataType: "int", isOutput: false }],
      definition: "CREATE FUNCTION get_user...",
    }),
    listSchemas: vi.fn().mockResolvedValue([
      { name: "public" },
      { name: "auth" },
    ]),
    ...overrides,
  };
}

describe("list_tables tool", () => {
  const audit: AuditEntry[] = [];

  beforeEach(() => {
    audit.length = 0;
    clearLogSinks();
    addLogSink((e) => audit.push(e));
  });

  it("returns tables with count and timing", async () => {
    const { handler } = await import("../../src/tools/list-tables.js");
    const driver = createMockDriver();
    const result = await handler(driver, {});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tableCount).toBe(2);
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(audit).toHaveLength(1);
    expect(audit[0].tool).toBe("list_tables");
  });

  it("handles errors gracefully", async () => {
    const { handler } = await import("../../src/tools/list-tables.js");
    const driver = createMockDriver({
      listTables: vi.fn().mockRejectedValue(new Error("Connection lost")),
    });
    const result = await handler(driver, {});

    expect(result.content[0].text).toContain("Error: Connection lost");
    expect(audit[0].error).toContain("Connection lost");
  });
});

describe("get_table_schema tool", () => {
  const audit: AuditEntry[] = [];

  beforeEach(() => {
    audit.length = 0;
    clearLogSinks();
    addLogSink((e) => audit.push(e));
  });

  it("returns columns for existing table", async () => {
    const { handler } = await import("../../src/tools/get-table-schema.js");
    const driver = createMockDriver();
    const result = await handler(driver, { table: "users" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.columnCount).toBe(2);
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns not-found for missing table", async () => {
    const { handler } = await import("../../src/tools/get-table-schema.js");
    const driver = createMockDriver({
      getTableSchema: vi.fn().mockResolvedValue([]),
    });
    const result = await handler(driver, { table: "nonexistent" });

    expect(result.content[0].text).toContain("not found");
  });
});

describe("describe_procedure tool", () => {
  const audit: AuditEntry[] = [];

  beforeEach(() => {
    audit.length = 0;
    clearLogSinks();
    addLogSink((e) => audit.push(e));
  });

  it("returns procedure definition", async () => {
    const { handler } = await import("../../src/tools/describe-procedure.js");
    const driver = createMockDriver();
    const result = await handler(driver, { procedure: "get_user" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("get_user");
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns not-found for missing procedure", async () => {
    const { handler } = await import("../../src/tools/describe-procedure.js");
    const driver = createMockDriver({
      describeProcedure: vi.fn().mockResolvedValue(null),
    });
    const result = await handler(driver, { procedure: "missing" });

    expect(result.content[0].text).toContain("not found");
  });
});

describe("list_schemas tool", () => {
  const audit: AuditEntry[] = [];

  beforeEach(() => {
    audit.length = 0;
    clearLogSinks();
    addLogSink((e) => audit.push(e));
  });

  it("returns schemas with timing", async () => {
    const { handler } = await import("../../src/tools/list-schemas.js");
    const driver = createMockDriver();
    const result = await handler(driver);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.schemaCount).toBe(2);
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("run_query tool", () => {
  const audit: AuditEntry[] = [];

  beforeEach(() => {
    audit.length = 0;
    clearLogSinks();
    addLogSink((e) => audit.push(e));
    resetRateLimiter();
  });

  it("executes valid query with timing", async () => {
    const { createHandler } = await import("../../src/tools/run-query.js");
    const driver = createMockDriver();
    const handler = createHandler("postgres", 100);
    const result = await handler(driver, { query: "SELECT * FROM users", offset: 0 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(audit[0].tool).toBe("run_query");
  });

  it("blocks dangerous queries", async () => {
    const { createHandler } = await import("../../src/tools/run-query.js");
    const driver = createMockDriver();
    const handler = createHandler("postgres", 100);
    const result = await handler(driver, { query: "DELETE FROM users", offset: 0 });

    expect(result.content[0].text).toContain("BLOCKED");
    expect(audit[0].blocked).toBe(true);
  });

  it("supports pagination with offset", async () => {
    const { createHandler } = await import("../../src/tools/run-query.js");
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const driver = createMockDriver({
      runQuery: vi.fn().mockResolvedValue({
        columns: ["id"],
        rows,
        rowCount: 10,
        truncated: false,
      }),
    });
    const handler = createHandler("postgres", 3);
    const result = await handler(driver, { query: "SELECT * FROM items", offset: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.returnedRows).toBe(3);
    expect(parsed.offset).toBe(5);
    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextOffset).toBe(8);
  });

  it("enforces rate limiting", async () => {
    configureRateLimiter({ maxRequests: 1, windowMs: 60_000 });

    const { createHandler } = await import("../../src/tools/run-query.js");
    const driver = createMockDriver();
    const handler = createHandler("postgres", 100);

    await handler(driver, { query: "SELECT 1", offset: 0 });
    const result = await handler(driver, { query: "SELECT 1", offset: 0 });

    expect(result.content[0].text).toContain("Rate limit exceeded");
  });
});
