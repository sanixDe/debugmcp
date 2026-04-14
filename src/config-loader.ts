import { readFileSync } from "node:fs";
import { z } from "zod";
import type { AppConfig, ConnectionConfig, DriverType } from "./types.js";
import type { CliOptions } from "./cli.js";
import type { BrowserConfig } from "./browser/browser-manager.js";

const VALID_DRIVERS: readonly DriverType[] = [
  "mssql",
  "postgres",
  "mysql",
  "sqlite",
];

const DEFAULTS = {
  maxRows: 100,
  connectionTimeout: 15_000,
  requestTimeout: 30_000,
} as const;

// ============================================================
// Config file schema
// ============================================================
const connectionSchema = z.object({
  driver: z.enum(["mssql", "postgres", "mysql", "sqlite"]),
  connection: z.string().min(1),
  maxRows: z.number().positive().optional(),
  connectionTimeout: z.number().positive().optional(),
  requestTimeout: z.number().positive().optional(),
});

const configFileSchema = z.object({
  connections: z.record(z.string(), connectionSchema).optional().default({}),
  browser: z
    .object({
      enabled: z.boolean().optional().default(true),
      headless: z.boolean().optional().default(false),
    })
    .optional(),
  defaults: z
    .object({
      maxRows: z.number().positive().optional(),
      connectionTimeout: z.number().positive().optional(),
      requestTimeout: z.number().positive().optional(),
    })
    .optional(),
});

// ============================================================
// Resolve environment variable references ($VAR_NAME)
// ============================================================
function resolveEnvVars(value: string): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, varName) => {
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new Error(
        `Environment variable $${varName} is not set.\n` +
          `Referenced in connection string. Set it before starting debugmcp.`
      );
    }
    return resolved;
  });
}

// ============================================================
// Load config: CLI args > env vars > config file
// ============================================================
export interface FullConfig {
  readonly app: AppConfig;
  readonly browser: BrowserConfig | null;
}

export function loadConfig(cli: CliOptions): FullConfig {
  const browserEnabled = cli.browser || cli.browserOnly;
  const browserConfig: BrowserConfig | null = browserEnabled
    ? { headless: cli.headless ?? false }
    : null;

  // Browser-only mode — no database needed
  if (cli.browserOnly) {
    return { app: { connections: [] }, browser: browserConfig };
  }

  // Config file mode
  if (cli.config) {
    return { app: loadConfigFile(cli.config, cli), browser: browserConfig };
  }

  // Single connection mode (CLI args + env vars)
  const driver = (cli.driver ?? process.env.DEBUGMCP_DRIVER) as
    | DriverType
    | undefined;
  const connection = cli.connection ?? process.env.DEBUGMCP_CONNECTION;
  const maxRows =
    cli.maxRows ??
    (process.env.DEBUGMCP_MAX_ROWS
      ? parseInt(process.env.DEBUGMCP_MAX_ROWS, 10)
      : undefined);
  const name = cli.name ?? process.env.DEBUGMCP_NAME ?? "default";

  if (!driver) {
    throw new Error(
      "Missing --driver. Specify: postgres, mssql, mysql, or sqlite\n" +
        "Usage: debugmcp --driver postgres --connection \"postgresql://...\"\n" +
        "   or: debugmcp --browser-only   (browser tools only, no database)"
    );
  }

  if (!VALID_DRIVERS.includes(driver)) {
    throw new Error(
      `Invalid driver: "${driver}". Must be one of: ${VALID_DRIVERS.join(", ")}`
    );
  }

  if (!connection) {
    throw new Error(
      `Missing --connection. Provide a connection string for ${driver}\n` +
        "Usage: debugmcp --driver postgres --connection \"postgresql://...\""
    );
  }

  const config: ConnectionConfig = {
    name,
    driver,
    connection: resolveEnvVars(connection),
    maxRows: maxRows ?? DEFAULTS.maxRows,
    connectionTimeout: DEFAULTS.connectionTimeout,
    requestTimeout: DEFAULTS.requestTimeout,
  };

  return { app: { connections: [config] }, browser: browserConfig };
}

function loadConfigFile(path: string, cli: CliOptions): AppConfig {
  // Note: browser config from file is handled in loadConfig's caller
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new Error(`Cannot read config file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${path}`);
  }

  const result = configFileSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Config validation failed:\n${errors}`);
  }

  const file = result.data;
  const fileDefaults = file.defaults ?? {};

  const connections: ConnectionConfig[] = Object.entries(
    file.connections
  ).map(([name, conn]) => ({
    name,
    driver: conn.driver,
    connection: resolveEnvVars(conn.connection),
    maxRows:
      cli.maxRows ??
      conn.maxRows ??
      fileDefaults.maxRows ??
      DEFAULTS.maxRows,
    connectionTimeout:
      conn.connectionTimeout ??
      fileDefaults.connectionTimeout ??
      DEFAULTS.connectionTimeout,
    requestTimeout:
      conn.requestTimeout ??
      fileDefaults.requestTimeout ??
      DEFAULTS.requestTimeout,
  }));

  if (connections.length === 0) {
    throw new Error("Config file has no connections defined");
  }

  return { connections };
}
