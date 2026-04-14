import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/config-loader.js";
import type { CliOptions } from "../../src/cli.js";

describe("config-loader", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns browser-only config when --browser-only", () => {
    const cli: CliOptions = { browserOnly: true, browser: false, headless: false };
    const result = loadConfig(cli);

    expect(result.app.connections).toHaveLength(0);
    expect(result.browser).toEqual({ headless: false });
  });

  it("throws when driver is missing", () => {
    const cli: CliOptions = { browser: false, headless: false, browserOnly: false };
    delete process.env.DEBUGMCP_DRIVER;

    expect(() => loadConfig(cli)).toThrow("Missing --driver");
  });

  it("throws when connection is missing", () => {
    const cli: CliOptions = {
      driver: "postgres",
      browser: false,
      headless: false,
      browserOnly: false,
    };
    delete process.env.DEBUGMCP_CONNECTION;

    expect(() => loadConfig(cli)).toThrow("Missing --connection");
  });

  it("throws on invalid driver type", () => {
    const cli: CliOptions = {
      driver: "oracle",
      connection: "test",
      browser: false,
      headless: false,
      browserOnly: false,
    };

    expect(() => loadConfig(cli)).toThrow('Invalid driver: "oracle"');
  });

  it("builds single connection config from CLI args", () => {
    const cli: CliOptions = {
      driver: "postgres",
      connection: "postgresql://localhost/test",
      name: "mydb",
      maxRows: 50,
      browser: false,
      headless: false,
      browserOnly: false,
    };

    const result = loadConfig(cli);
    expect(result.app.connections).toHaveLength(1);
    expect(result.app.connections[0].name).toBe("mydb");
    expect(result.app.connections[0].driver).toBe("postgres");
    expect(result.app.connections[0].maxRows).toBe(50);
    expect(result.browser).toBeNull();
  });

  it("resolves environment variables in connection string", () => {
    process.env.TEST_DB_HOST = "myhost";
    const cli: CliOptions = {
      driver: "postgres",
      connection: "postgresql://$TEST_DB_HOST/test",
      browser: false,
      headless: false,
      browserOnly: false,
    };

    const result = loadConfig(cli);
    expect(result.app.connections[0].connection).toBe(
      "postgresql://myhost/test"
    );
  });

  it("throws when referenced env var is not set", () => {
    delete process.env.MISSING_VAR;
    const cli: CliOptions = {
      driver: "postgres",
      connection: "$MISSING_VAR",
      browser: false,
      headless: false,
      browserOnly: false,
    };

    expect(() => loadConfig(cli)).toThrow("MISSING_VAR is not set");
  });

  it("enables browser config when --browser flag set", () => {
    const cli: CliOptions = {
      driver: "sqlite",
      connection: ":memory:",
      browser: true,
      headless: true,
      browserOnly: false,
    };

    const result = loadConfig(cli);
    expect(result.browser).toEqual({ headless: true });
  });
});
