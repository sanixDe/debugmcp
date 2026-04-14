import type { DatabaseDriver } from "../types.js";
import { logAudit, startTimer } from "../logger.js";

export const name = "list_schemas";
export const description = "List all schemas or namespaces in the database.";
export const params = {};

export async function handler(driver: DatabaseDriver) {
  const elapsed = startTimer();

  try {
    const schemas = await driver.listSchemas();
    const durationMs = elapsed();

    logAudit({
      timestamp: new Date().toISOString(),
      tool: name,
      database: driver.driverName,
      durationMs,
      rowCount: schemas.length,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { schemaCount: schemas.length, durationMs, schemas },
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
