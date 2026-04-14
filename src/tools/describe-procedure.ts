import { z } from "zod";
import type { DatabaseDriver } from "../types.js";
import { logAudit, startTimer } from "../logger.js";

export const name = "describe_procedure";
export const description =
  "Get the definition and parameters of a stored procedure or function.";
export const params = {
  procedure: z
    .string()
    .describe("Stored procedure or function name"),
};

export async function handler(
  driver: DatabaseDriver,
  { procedure }: { procedure: string }
) {
  const elapsed = startTimer();

  try {
    const info = await driver.describeProcedure(procedure);
    const durationMs = elapsed();

    if (!info) {
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
            text: `Procedure '${procedure}' not found, or this database does not support stored procedures.`,
          },
        ],
      };
    }

    logAudit({
      timestamp: new Date().toISOString(),
      tool: name,
      database: driver.driverName,
      durationMs,
      rowCount: info.parameters.length,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ...info, durationMs }, null, 2),
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
