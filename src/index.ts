#!/usr/bin/env node

import { parseCli } from "./cli.js";
import { loadConfig } from "./config-loader.js";
import { startServer } from "./server.js";

async function main() {
  try {
    const cli = parseCli(process.argv);
    const { app, browser } = loadConfig(cli);
    await startServer(app, browser);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`debugmcp error: ${message}`);
    process.exit(1);
  }
}

main();
