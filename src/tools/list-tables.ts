import { z } from "zod";
import type { DatabaseDriver } from "../types.js";
import { logAudit, startTimer } from "../logger.js";

export const name = "list_tables";
export const description =
  "List all tables in the database with approximate row counts.";
export const params = {
  schema: z.string().optional().describe("Filter by schema name"),
};

export async function handler(
  driver: DatabaseDriver,
  { schema }: { schema?: string }
) {
  const elapsed = startTimer();

  try {
    const tables = await driver.listTables(schema);
    const durationMs = elapsed();

    logAudit({
      timestamp: new Date().toISOString(),
      tool: name,
      database: driver.driverName,
      durationMs,
      rowCount: tables.length,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { tableCount: tables.length, durationMs, tables },
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
