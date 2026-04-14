import { z } from "zod";
import type { DatabaseDriver } from "../types.js";
import { logAudit, startTimer } from "../logger.js";

export const name = "get_table_schema";
export const description =
  "Get column definitions, data types, constraints, and foreign key relationships for a table.";
export const params = {
  table: z.string().describe("Table name"),
  schema: z.string().optional().describe("Schema name (default varies by DB)"),
};

export async function handler(
  driver: DatabaseDriver,
  { table, schema }: { table: string; schema?: string }
) {
  const elapsed = startTimer();

  try {
    const columns = await driver.getTableSchema(table, schema);
    const durationMs = elapsed();

    if (columns.length === 0) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        database: driver.driverName,
        durationMs,
        rowCount: 0,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Table '${table}' not found. Use list_tables to see available tables.`,
          },
        ],
      };
    }

    logAudit({
      timestamp: new Date().toISOString(),
      tool: name,
      database: driver.driverName,
      durationMs,
      rowCount: columns.length,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { table, columnCount: columns.length, durationMs, columns },
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
      database: driver.driverName,
      durationMs,
      error: message,
    });

    return {
      content: [
        { type: "text" as const, text: `Error: ${message}` },
      ],
    };
  }
}
