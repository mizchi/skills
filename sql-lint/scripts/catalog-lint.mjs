#!/usr/bin/env node
// Minimal sanity lint for sqlc-style query catalogs.
//
// Catches the cheap-but-easy-to-miss mistakes that sqlc itself does not flag:
//   - duplicate `-- name: X :type` (the second one silently shadows in some
//     codegens, broken in others)
//   - missing trailing `;` (sqlc requires it)
//   - `SELECT *` (always over-fetch; spell out the columns instead)
//   - bare `LIKE '%foo%'` (full-table scan; only flagged when no neighbouring
//     index condition is obvious)
//   - empty body between two `-- name:` markers
//   - `-- name:` line that does not match the `name: X :type` shape
//
// Heavier shape / style checking belongs in sqlfluff (see SKILL.md). This
// script has zero dependencies so it works in any CI without extra tooling.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = { files: [], rules: "default" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--rules") args.rules = argv[++i];
    else if (k === "--help" || k === "-h") {
      console.error(
        "catalog-lint.mjs [--rules default|strict] <file> [<file> ...]",
      );
      process.exit(0);
    } else args.files.push(k);
  }
  if (args.files.length === 0) {
    console.error("at least one query file is required");
    process.exit(2);
  }
  return args;
}

function lintFile(path, source, rules) {
  const findings = [];
  const lines = source.split("\n");
  const names = new Map(); // name -> first line number

  let current = null;
  let currentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("-- name:")) {
      // Flush previous query.
      if (current) {
        flushQuery(path, current, currentStart, findings);
      }
      const match = line.match(/^--\s*name:\s*(\S+)\s*:(\S+)\s*$/);
      if (!match) {
        findings.push({
          path, line: i + 1, rule: "malformed-name",
          message: `malformed -- name: line: ${JSON.stringify(line)}`,
        });
        current = null;
        continue;
      }
      const name = match[1];
      if (names.has(name)) {
        findings.push({
          path, line: i + 1, rule: "duplicate-name",
          message: `duplicate query name '${name}' (also at line ${names.get(name)})`,
        });
      } else {
        names.set(name, i + 1);
      }
      current = { name, type: match[2], body: [], headerLine: i + 1 };
      currentStart = i + 1;
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) flushQuery(path, current, currentStart, findings);

  if (rules === "strict") {
    // Add strict-only checks here in future.
  }
  return findings;
}

function flushQuery(path, query, start, findings) {
  const body = query.body.join("\n").trim();
  if (body.length === 0) {
    findings.push({
      path, line: query.headerLine, rule: "empty-body",
      message: `query '${query.name}' has no SQL body`,
    });
    return;
  }
  if (!body.endsWith(";")) {
    findings.push({
      path, line: query.headerLine, rule: "missing-semicolon",
      message: `query '${query.name}' does not end with ';'`,
    });
  }
  // Comments stripped before pattern checks.
  const stripped = body
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  if (/\bSELECT\s+\*/i.test(stripped)) {
    findings.push({
      path, line: query.headerLine, rule: "select-star",
      message: `query '${query.name}' uses SELECT * (spell out columns)`,
    });
  }
  // LIKE '%...%' is fine on FTS / small tables; we only flag the unanchored
  // double-wildcard variant. Single-anchor (`LIKE 'foo%'`) can use a B-tree.
  if (/LIKE\s+['"]%[^'"]*%['"]/i.test(stripped)) {
    findings.push({
      path, line: query.headerLine, rule: "double-wildcard-like",
      message: `query '${query.name}' uses LIKE '%...%' (full scan risk)`,
    });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let findings = [];
  for (const f of args.files) {
    const abs = resolve(f);
    const text = readFileSync(abs, "utf8");
    findings = findings.concat(lintFile(abs, text, args.rules));
  }
  if (findings.length === 0) {
    console.log("sql catalog lint: ok");
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`${f.path}:${f.line}: [${f.rule}] ${f.message}`);
  }
  console.error(`sql catalog lint: ${findings.length} findings`);
  process.exit(1);
}

main();
