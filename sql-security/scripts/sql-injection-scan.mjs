#!/usr/bin/env node
// Cheap text-based SQL-injection screening for host code (MoonBit / TS / etc).
//
// Looks inside string literals that contain SQL keywords (SELECT / INSERT /
// UPDATE / DELETE / WHERE) and flags string-concat patterns adjacent to them:
//   - `... ${variable} ...` template interpolation
//   - `"..." + variable`  ad-hoc concat
//   - `[".." + variable, ".."]` builder arrays
//
// Quote-stripped `?` placeholders are safe and ignored. The goal is to catch
// the post-sqlc residue: a stray inline string concat for a SELECT that
// somehow got past code review.
//
// CLI: sql-injection-scan.mjs [--ext .mbt,.ts,.tsx] <file|dir> ...

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";

function parseArgs(argv) {
  const args = {
    exts: [".mbt", ".ts", ".tsx", ".rs", ".mjs", ".js"],
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--ext") args.exts = argv[++i].split(",");
    else if (k === "--help" || k === "-h") {
      console.error(
        "sql-injection-scan.mjs [--ext .mbt,.ts,.tsx] <file|dir> ...",
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

function* walk(path, exts) {
  let stat;
  try { stat = statSync(path); } catch { return; }
  if (stat.isFile()) {
    if (exts.includes(extname(path))) yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry.startsWith(".") || entry === "node_modules" ||
        entry === "_build" || entry === "dist" || entry === "target") {
      continue;
    }
    yield* walk(join(path, entry), exts);
  }
}

// Case-sensitive: SQL is uppercase by convention, so requiring caps weeds
// out English "from" / "where" / "join" prose.
const SQL_KW_STRICT = /\b(SELECT|INSERT\s+INTO|INSERT\s+OR|UPDATE|DELETE\s+FROM|FROM|WHERE|JOIN|HAVING|GROUP\s+BY|ORDER\s+BY)\b/;
// Template literal that *starts* with a SQL keyword (with optional
// leading whitespace / parens / fragments like "AND (").
const SQL_STARTS_TPL = /`\s*(SELECT|INSERT\s+(?:OR\s+)?INTO|UPDATE|DELETE\s+FROM|WITH|AND\s+\(|OR\s+\(|WHERE|FROM|JOIN|GROUP|ORDER|HAVING)/;

function scanLine(line) {
  // Template literal that contains a placeholder AND starts with SQL.
  const tplMatch = line.match(/`[^`]*\${[^}]+}[^`]*`/);
  if (tplMatch && SQL_STARTS_TPL.test(tplMatch[0])) {
    return { rule: "template-interp", excerpt: tplMatch[0].slice(0, 120) };
  }
  // Concat: "SELECT ..." + variable
  const concat = line.match(/"[^"]*"\s*\+\s*[A-Za-z_$][A-Za-z0-9_$.]*/);
  if (concat && SQL_KW_STRICT.test(concat[0])) {
    return { rule: "string-concat", excerpt: concat[0].slice(0, 120) };
  }
  return null;
}

function shouldIgnoreFile(path) {
  // Generated files are intentionally outside scope.
  return path.includes("/db/gen/") || path.includes("/_build/") ||
    path.endsWith(".test.mjs") || path.endsWith(".test.mbt") ||
    path.includes("/sqlc_queries.mbt") || path.includes("/sqlc_types.mbt");
}

// A line can be opted out with one of:
//   // sql-security: ok [<short reason>]
//   # sql-security: ok [<short reason>]
// The marker may appear on the same line OR on the previous line.
const ALLOW_MARKER = /(?:\/\/|#)\s*sql-security:\s*ok/;

function main() {
  const args = parseArgs(process.argv.slice(2));
  let findings = [];
  for (const target of args.files) {
    for (const file of walk(resolve(target), args.exts)) {
      if (shouldIgnoreFile(file)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const hit = scanLine(line);
        if (!hit) return;
        // Opt-out marker on the line itself or the previous one.
        if (ALLOW_MARKER.test(line)) return;
        const prev = lines[i - 1] || "";
        if (ALLOW_MARKER.test(prev)) return;
        findings.push({ path: file, line: i + 1, ...hit });
      });
    }
  }
  if (findings.length === 0) {
    console.log("sql injection scan: no candidates");
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`${f.path}:${f.line}: [${f.rule}] ${f.excerpt}`);
  }
  console.error(
    `sql injection scan: ${findings.length} candidate${findings.length === 1 ? "" : "s"} (review manually)`,
  );
  // Exit 1 — these are review-required findings, not info.
  process.exit(1);
}

main();
