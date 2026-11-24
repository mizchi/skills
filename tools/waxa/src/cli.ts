#!/usr/bin/env node
/**
 * waxa — skill evaluation CLI. See ./waxa.ts for the implementation.
 *
 *   waxa <eval.yaml> [--task ID] [--baseline]
 *   waxa iterate <eval.yaml> [--max N] [--task ID]
 */
import { main } from "./waxa.ts";

process.exitCode = await main(process.argv.slice(2));
