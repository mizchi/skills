#!/usr/bin/env node
// SQLite EXPLAIN QUERY PLAN runner for sqlc-style query catalogs.
//
// - Loads a schema file into in-memory SQLite.
// - Parses a query catalog with `-- name: X :type` markers.
// - Substitutes `sqlc.arg('x')` and `sqlc.slice('x')` with NULL placeholders
//   so the planner can resolve types without real binds.
// - Runs EXPLAIN QUERY PLAN for every query.
// - Emits a stable JSON / text dump that diffs cleanly across PRs.
//
// CLI: explain-runner.mjs --schema <path> --queries <path> [--out <path>]
//                         [--baseline <path>] [--format json|text]
//                         [--fail-on regress|scan|none]

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    schema: null,
    queries: null,
    out: null,
    baseline: null,
    format: "text",
    failOn: "regress",
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--schema") args.schema = argv[++i];
    else if (k === "--queries") args.queries = argv[++i];
    else if (k === "--out") args.out = argv[++i];
    else if (k === "--baseline") args.baseline = argv[++i];
    else if (k === "--format") args.format = argv[++i];
    else if (k === "--fail-on") args.failOn = argv[++i];
    else if (k === "--help" || k === "-h") {
      console.error(
        "explain-runner.mjs --schema <path> --queries <path> [--out <path>] " +
          "[--baseline <path>] [--format json|text] [--fail-on regress|scan|none]",
      );
      process.exit(0);
    }
  }
  if (!args.schema || !args.queries) {
    console.error("--schema and --queries are required");
    process.exit(2);
  }
  return args;
}

// Split a sqlc-style query catalog into [{ name, type, sql }].
function parseQueryCatalog(text) {
  const queries = [];
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const header = line.match(/^--\s*name:\s*(\S+)\s*:(\S+)\s*$/);
    if (header) {
      if (current) queries.push(current);
      current = { name: header[1], type: header[2], sqlLines: [] };
      continue;
    }
    if (line.startsWith("--")) continue;
    if (current) current.sqlLines.push(line);
  }
  if (current) queries.push(current);
  return queries
    .map((q) => ({
      name: q.name,
      type: q.type,
      sql: q.sqlLines.join("\n").trim().replace(/;\s*$/, ""),
    }))
    .filter((q) => q.sql.length > 0);
}

// EXPLAIN QUERY PLAN does not need real bind values; substitute placeholders
// with NULL so the planner runs. `sqlc.slice('x')` expands to NULL (single
// element) because the planner only cares about the IN clause shape.
function rewritePlaceholders(sql) {
  let rewritten = sql.replace(/sqlc\.arg\(['"][^'"]+['"]\)/g, "NULL");
  rewritten = rewritten.replace(/sqlc\.slice\(['"][^'"]+['"]\)/g, "NULL");
  return rewritten;
}

function explainPlan(db, sql) {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
  return plan.map((row) => ({
    id: row.id,
    parent: row.parent,
    detail: row.detail,
  }));
}

function planSeverity(detail) {
  const d = String(detail);
  if (/^SCAN\b/.test(d)) return "scan";
  if (/USE TEMP B-TREE FOR (ORDER BY|GROUP BY|DISTINCT)/.test(d))
    return "temp-btree";
  if (/^SEARCH\b/.test(d)) return "search";
  return "info";
}

function formatTextReport(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`-- ${r.name} :${r.type}`);
    if (r.error) {
      lines.push(`  ERROR: ${r.error}`);
      lines.push("");
      continue;
    }
    for (const p of r.plan) {
      const sev = planSeverity(p.detail);
      const marker = sev === "scan" ? "!" : sev === "temp-btree" ? "?" : " ";
      lines.push(`  ${marker} ${p.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function summarize(results) {
  const summary = { total: 0, scan: 0, tempBtree: 0, errors: 0 };
  for (const r of results) {
    summary.total += 1;
    if (r.error) {
      summary.errors += 1;
      continue;
    }
    for (const p of r.plan) {
      const sev = planSeverity(p.detail);
      if (sev === "scan") summary.scan += 1;
      else if (sev === "temp-btree") summary.tempBtree += 1;
    }
  }
  return summary;
}

function diffBaseline(prev, current) {
  // Both keyed by query name. Returns regressions = queries whose plan
  // gained a SCAN or temp-btree that wasn't present before.
  const regressions = [];
  for (const r of current) {
    const before = prev[r.name];
    if (!before) continue;
    const before_scans = before.plan.filter(
      (p) => planSeverity(p.detail) !== "search" &&
        planSeverity(p.detail) !== "info",
    ).map((p) => p.detail).sort();
    const after_scans = (r.plan || []).filter(
      (p) => planSeverity(p.detail) !== "search" &&
        planSeverity(p.detail) !== "info",
    ).map((p) => p.detail).sort();
    if (after_scans.length > before_scans.length) {
      regressions.push({ name: r.name, before: before_scans, after: after_scans });
    }
  }
  return regressions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const schemaPath = resolve(args.schema);
  const queriesPath = resolve(args.queries);
  const schema = readFileSync(schemaPath, "utf8");
  const catalog = parseQueryCatalog(readFileSync(queriesPath, "utf8"));

  const db = new DatabaseSync(":memory:");
  db.exec(schema);

  const results = [];
  for (const q of catalog) {
    const sql = rewritePlaceholders(q.sql);
    try {
      const plan = explainPlan(db, sql);
      results.push({ name: q.name, type: q.type, plan });
    } catch (e) {
      results.push({ name: q.name, type: q.type, plan: [], error: e.message });
    }
  }

  const summary = summarize(results);
  const payload = { summary, queries: results };
  const output =
    args.format === "json"
      ? JSON.stringify(payload, null, 2) + "\n"
      : formatTextReport(results) +
        `\n-- summary: ${summary.total} queries, ${summary.scan} SCAN, ` +
        `${summary.tempBtree} TEMP B-TREE, ${summary.errors} errors\n`;

  if (args.out) writeFileSync(resolve(args.out), output);
  else process.stdout.write(output);

  let exit = 0;
  if (args.baseline && existsSync(resolve(args.baseline))) {
    const prevText = readFileSync(resolve(args.baseline), "utf8");
    const prev = JSON.parse(prevText);
    const prevByName = Object.fromEntries(
      (prev.queries || []).map((q) => [q.name, q]),
    );
    const regressions = diffBaseline(prevByName, results);
    if (regressions.length > 0) {
      console.error(
        `query plan regressions (${regressions.length}):\n` +
          regressions
            .map(
              (r) =>
                `  ${r.name}: +${r.after.length - r.before.length} unindexed access\n` +
                `    before: ${JSON.stringify(r.before)}\n` +
                `    after:  ${JSON.stringify(r.after)}`,
            )
            .join("\n"),
      );
      if (args.failOn === "regress" || args.failOn === "scan") exit = 1;
    }
  } else if (args.failOn === "scan" && summary.scan > 0) {
    console.error(`fail-on=scan: ${summary.scan} SCAN entries`);
    exit = 1;
  }

  db.close();
  process.exit(exit);
}

main();
