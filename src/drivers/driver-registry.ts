import type { DatabaseDriver, DriverFactory, DriverType } from "../types.js";

/**
 * Lazily load a driver module. If the underlying npm package
 * is not installed, throws a helpful error message.
 */
async function loadDriver(
  driverType: DriverType,
  packageName: string,
  modulePath: string
): Promise<DatabaseDriver> {
  try {
    const mod = await import(modulePath);
    return mod.createDriver() as DatabaseDriver;
  } catch (err: unknown) {
    const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new Error(
        `${driverType} driver requires "${packageName}" package.\n` +
          `Install it: npm install ${packageName}`
      );
    }
    throw err;
  }
}

/**
 * Create a database driver instance for the given type.
 * Drivers are loaded lazily so users only need the package
 * for their specific database installed.
 */
export async function createDriver(
  driverType: DriverType
): Promise<DatabaseDriver> {
  switch (driverType) {
    case "sqlite":
      return loadDriver("sqlite", "better-sqlite3", "./sqlite-driver.js");
    case "postgres":
      return loadDriver("postgres", "pg", "./postgres-driver.js");
    case "mysql":
      return loadDriver("mysql", "mysql2", "./mysql-driver.js");
    case "mssql":
      return loadDriver("mssql", "mssql", "./mssql-driver.js");
    default:
      throw new Error(`Unknown driver type: ${driverType}`);
  }
}
