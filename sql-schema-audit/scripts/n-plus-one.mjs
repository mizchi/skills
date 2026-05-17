#!/usr/bin/env node
// Text-based N+1 detector for MoonBit / Rust / TS code that calls sqlc
// generated functions inside a `for` loop. ast-grep would be cleaner, but
// MoonBit has no tree-sitter grammar yet (2025-11), so we lean on regex.
//
// Heuristic: a `for` line followed within N lines by `@db.<fn_name>(` (or
// `db.<fn_name>(` for TS/Rust) without a separating closing brace counts as
// a candidate. False positives expected — this is a review aid, not a gate.
//
// CLI: n-plus-one.mjs [--glob "src/**/*.mbt"] [--callee-prefix @db.] [--window 10]
//                     <file> [<file> ...]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";

function parseArgs(argv) {
  const args = {
    callees: ["@db.", "db."],
    window: 12,
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--callee-prefix") args.callees = argv[++i].split(",");
    else if (k === "--window") args.window = Number(argv[++i]);
    else if (k === "--help" || k === "-h") {
      console.error(
        "n-plus-one.mjs [--callee-prefix @db.,db.] [--window 12] <file|dir> ...",
      );
      process.exit(0);
    } else args.files.push(k);
  }
  if (args.files.length === 0) {
    console.error("at least one file or directory is required");
    process.exit(2);
  }
  return args;
}

function* walk(path) {
  const stat = statSync(path);
  if (stat.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "_build" || entry === "dist") {
      continue;
    }
    const full = join(path, entry);
    yield* walk(full);
  }
}

function scan(path, source, callees, window) {
  const lines = source.split("\n");
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const forMatch = line.match(/^\s*(for\s+\S+\s+in\s+|for\s*\(\s*const\s+\S+\s+of\s+)/);
    if (!forMatch) continue;
    const end = Math.min(i + 1 + window, lines.length);
    for (let j = i + 1; j < end; j++) {
      const inner = lines[j];
      // Stop at closing brace at same indent level.
      if (inner.match(/^\s{0,4}\}\s*$/)) break;
      for (const callee of callees) {
        const escaped = callee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`${escaped}([a-z_][a-z0-9_]*)\\s*\\(`);
        const m = inner.match(re);
        if (m) {
          findings.push({
            path, line: i + 1, callee: `${callee}${m[1]}`,
            inner_line: j + 1,
          });
          break;
        }
      }
    }
  }
  return findings;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const exts = [".mbt", ".ts", ".tsx", ".rs", ".mjs", ".js"];
  let findings = [];
  for (const target of args.files) {
    for (const file of walk(resolve(target))) {
      if (!exts.includes(extname(file))) continue;
      const text = readFileSync(file, "utf8");
      findings = findings.concat(scan(file, text, args.callees, args.window));
    }
  }
  if (findings.length === 0) {
    console.log("n+1 scan: no candidates");
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`${f.path}:${f.line}: for-loop calls ${f.callee}() at line ${f.inner_line}`);
  }
  console.error(`n+1 scan: ${findings.length} candidate${findings.length === 1 ? "" : "s"} (review manually)`);
  // Exit 0 — this is review aid, not a fail-gate.
}

main();
