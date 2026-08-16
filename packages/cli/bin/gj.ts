#!/usr/bin/env bun
import { main } from "../src/main.js";

main(process.argv.slice(2)).catch((err) => {
  console.error(`\n✗ ${(err as Error).message}`);
  if (process.env.GJ_DEBUG) console.error(err);
  process.exit(1);
});
