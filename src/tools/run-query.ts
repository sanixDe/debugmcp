import { z } from "zod";
import type { DatabaseDriver, DriverType } from "../types.js";
import { validateQuery } from "../validation/sql-validator.js";
import { mssqlRules } from "../validation/mssql-rules.js";
import { postgresRules } from "../validation/postgres-rules.js";
import { mysqlRules } from "../validation/mysql-rules.js";
import { sqliteRules } from "../validation/sqlite-rules.js";
import type { DialectRules } from "../types.js";
import { logAudit, startTimer } from "../logger.js";
import { checkRateLimit } from "../rate-limiter.js";

const dialectMap: Record<DriverType, DialectRules | undefined> = {
  mssql: mssqlRules,
  postgres: postgresRules,
  mysql: mysqlRules,
  sqlite: sqliteRules,
};

export const name = "run_query";
export const description =
  "Execute a read-only SQL query. Only SELECT statements are allowed. Supports pagination via offset.";
export const params = {
  query: z.string().describe("SQL SELECT query to execute. Must be read-only."),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Override max rows for this query (default from config, max 500)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of rows to skip for pagination (default 0)"),
};

export function createHandler(driverType: DriverType, configMaxRows: number) {
  const dialect = dialectMap[driverType];

  return async function handler(
    driver: DatabaseDriver,
    { query, maxRows, offset }: { query: string; maxRows?: number; offset: number }
  ) {
    const elapsed = startTimer();

    // Rate limit check
    const rateCheck = checkRateLimit();
    if (!rateCheck.allowed) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        database: driverType,
        query,
        durationMs: elapsed(),
        blocked: true,
        blockedReason: "Rate limit exceeded",
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s.`,
          },
        ],
      };
    }

    // Query validation
    const validation = validateQuery(query, dialect);
    if (!validation.safe) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        database: driverType,
        query,
        durationMs: elapsed(),
        blocked: true,
        blockedReason: validation.reason,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `BLOCKED: ${validation.reason}\n\nOnly read-only queries (SELECT, WITH, DECLARE+SELECT) are allowed.`,
          },
        ],
      };
    }

    const limit = Math.min(maxRows ?? configMaxRows, 500);

    try {
      const result = await driver.runQuery(query, limit + offset);
      const sliced = result.rows.slice(offset, offset + limit);
      const totalRows = result.rowCount;
      const hasMore = offset + limit < totalRows;

      const durationMs = elapsed();

      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        database: driverType,
        query,
        durationMs,
        rowCount: totalRows,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalRows,
                returnedRows: sliced.length,
                offset,
                hasMore,
                nextOffset: hasMore ? offset + limit : null,
                truncated: result.truncated,
                durationMs,
                columns: result.columns,
                data: sliced,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const durationMs = elapsed();
      const message = err instanceof Error ? err.message : "Unknown error";

      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        database: driverType,
        query,
        durationMs,
        error: message,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Query error: ${message}`,
          },
        ],
      };
    }
  };
}
