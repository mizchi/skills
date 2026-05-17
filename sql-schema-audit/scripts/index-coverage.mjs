#!/usr/bin/env node
// Index-coverage report for a sqlc-style query catalog.
//
// For every query, walk the EXPLAIN QUERY PLAN, identify SCAN steps, and
// look up whether the table has an index that could cover the WHERE / JOIN
// columns. Output: per-query table-scan justification (and a TODO marker
// when the scan looks fixable).
//
// This complements `sql-plan-audit` (which baselines plans) by attributing
// *why* a scan happens.
//
// CLI: index-coverage.mjs --schema <path> --queries <path> [--out <path>]

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = { schema: null, queries: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--schema") args.schema = argv[++i];
    else if (k === "--queries") args.queries = argv[++i];
    else if (k === "--out") args.out = argv[++i];
    else if (k === "--help" || k === "-h") {
      console.error(
        "index-coverage.mjs --schema <path> --queries <path> [--out <path>]",
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

function parseCatalog(text) {
  const queries = [];
  let current = null;
  for (const line of text.split("\n")) {
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
      name: q.name, type: q.type,
      sql: q.sqlLines.join("\n").trim().replace(/;\s*$/, ""),
    }))
    .filter((q) => q.sql.length > 0);
}

function rewritePlaceholders(sql) {
  return sql
    .replace(/sqlc\.arg\(['"][^'"]+['"]\)/g, "NULL")
    .replace(/sqlc\.slice\(['"][^'"]+['"]\)/g, "NULL");
}

function collectIndexCoverage(db) {
  // Returns { tableName: [{ name, columns: [string] }] } including PK and
  // unique constraints (which sqlite stores as sqlite_autoindex_*).
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all();
  const out = {};
  for (const t of tables) {
    const indexes = db
      .prepare(`PRAGMA index_list("${t.name}")`)
      .all();
    out[t.name] = indexes.map((idx) => {
      const cols = db.prepare(`PRAGMA index_info("${idx.name}")`).all();
      return {
        name: idx.name,
        unique: idx.unique === 1,
        columns: cols.map((c) => c.name),
      };
    });
  }
  return out;
}

// Returns { tableName: [{ from: [col], to: [col], onDelete: "CASCADE"|... }] }.
// SQLite does not auto-create indexes on FK columns; absent an explicit index,
// ON DELETE CASCADE / ON UPDATE CASCADE walks the child table with a full
// scan. So an index whose columns are a prefix of an FK's `from` list is
// load-bearing for cascade performance even when no SELECT references it.
function collectForeignKeys(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all();
  const out = {};
  for (const t of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${t.name}")`).all();
    // Group multi-column FKs by `id`.
    const grouped = {};
    for (const row of fks) {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          from: [],
          to: [],
          onDelete: row.on_delete,
          onUpdate: row.on_update,
          referenced: row.table,
        };
      }
      grouped[row.id].from[row.seq] = row.from;
      grouped[row.id].to[row.seq] = row.to;
    }
    out[t.name] = Object.values(grouped);
  }
  return out;
}

// Does `index.columns` start with the FK's `from` columns?
function indexCoversFk(idxCols, fkFrom) {
  if (idxCols.length < fkFrom.length) return false;
  for (let i = 0; i < fkFrom.length; i++) {
    if (idxCols[i] !== fkFrom[i]) return false;
  }
  return true;
}

function classifyPlan(plan) {
  const scans = [];
  const searches = [];
  for (const p of plan) {
    const d = String(p.detail);
    let m = d.match(/^SCAN\s+(?:VIRTUAL\s+TABLE\s+)?(\S+)/);
    if (m) {
      scans.push({ kind: "scan", table: m[1].replace(/^TABLE\s+/, ""), detail: d });
      continue;
    }
    m = d.match(/^SEARCH\s+(\S+)\s+USING\s+(?:COVERING\s+)?INDEX\s+(\S+)/);
    if (m) {
      searches.push({ table: m[1], index: m[2], detail: d });
      continue;
    }
    m = d.match(/^SEARCH\s+(\S+)\s+USING\s+(?:INTEGER\s+)?PRIMARY KEY/);
    if (m) {
      searches.push({ table: m[1], index: "<pk>", detail: d });
    }
  }
  return { scans, searches };
}

function analyseScan(scan, indexInfo) {
  const idxs = indexInfo[scan.table] || [];
  if (idxs.length === 0) {
    return { rationale: "table has no indexes", fixable: true };
  }
  return {
    rationale: `table has ${idxs.length} index${idxs.length === 1 ? "" : "es"}: ${idxs.map((i) => `${i.name}(${i.columns.join(",")})`).join(", ")}`,
    fixable: false,  // intentionally vague — needs human review.
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const schema = readFileSync(resolve(args.schema), "utf8");
  const catalog = parseCatalog(readFileSync(resolve(args.queries), "utf8"));

  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const indexInfo = collectIndexCoverage(db);
  const fkInfo = collectForeignKeys(db);

  const reports = [];
  for (const q of catalog) {
    let plan;
    try {
      plan = db
        .prepare(`EXPLAIN QUERY PLAN ${rewritePlaceholders(q.sql)}`)
        .all();
    } catch (e) {
      reports.push({ name: q.name, type: q.type, error: e.message });
      continue;
    }
    const { scans, searches } = classifyPlan(plan);
    if (scans.length === 0 && searches.length === 0) continue;
    const scanReports = scans.map((s) => ({
      ...s, ...analyseScan(s, indexInfo),
    }));
    reports.push({
      name: q.name, type: q.type,
      scans: scanReports, searches,
    });
  }

  const lines = [];
  let unindexedTotal = 0;
  for (const r of reports) {
    if (r.error) {
      lines.push(`-- ${r.name}: ERROR ${r.error}`);
      continue;
    }
    if (r.scans.length === 0) continue;
    lines.push(`-- ${r.name} :${r.type}`);
    for (const s of r.scans) {
      const marker = s.fixable ? "FIX" : "   ";
      lines.push(`  ${marker} SCAN ${s.table}: ${s.rationale}`);
      if (s.fixable) unindexedTotal += 1;
    }
    lines.push("");
  }

  // Index usage histogram. SQLite EXPLAIN reports `SEARCH <alias> USING
  // INDEX <name>` where <alias> may be a table alias (e.g. `SEARCH j USING
  // INDEX idx_...`) rather than the real table name. Index names are
  // globally unique in SQLite, so key the usage map by index name alone
  // to avoid alias-induced false-positive "unused" results.
  const usage = {};
  for (const r of reports) {
    if (r.error || !r.searches) continue;
    for (const s of r.searches) {
      usage[s.index] = (usage[s.index] || 0) + 1;
    }
  }
  const unused = [];
  for (const [tbl, idxs] of Object.entries(indexInfo)) {
    for (const idx of idxs) {
      if (!(idx.name in usage)) {
        // Skip auto-indexes; their existence is intrinsic to the PK / UNIQUE.
        if (idx.name.startsWith("sqlite_autoindex_")) continue;
        unused.push({ table: tbl, index: idx.name, columns: idx.columns });
      }
    }
  }
  // Attribute each "unused" index — FK CASCADE column coverage means the
  // index is load-bearing for delete cascade performance even when no
  // SELECT picks it. Without this attribution, dropping the index would
  // silently regress cascade-delete latency.
  const unusedClassified = [];
  for (const u of unused) {
    const fks = fkInfo[u.table] || [];
    let fkCoveredBy = null;
    for (const fk of fks) {
      if (indexCoversFk(u.columns, fk.from)) {
        fkCoveredBy = fk;
        break;
      }
    }
    unusedClassified.push({ ...u, fkCoveredBy });
  }

  const droppable = unusedClassified.filter((u) => !u.fkCoveredBy);
  const fkLoadBearing = unusedClassified.filter((u) => u.fkCoveredBy);

  if (droppable.length > 0) {
    lines.push(
      "-- unused indexes — candidates for DROP (no SELECT picks them, no FK cascade depends on them)",
    );
    for (const u of droppable) {
      lines.push(`     ${u.table}.${u.index}(${u.columns.join(",")})`);
    }
    lines.push("");
  }
  if (fkLoadBearing.length > 0) {
    lines.push(
      "-- unused-by-SELECT but load-bearing for FK CASCADE (keep)",
    );
    for (const u of fkLoadBearing) {
      const fk = u.fkCoveredBy;
      lines.push(
        `     ${u.table}.${u.index}(${u.columns.join(",")})  -- FK ${fk.from.join(",")} -> ${fk.referenced}(${fk.to.join(",")}) ON DELETE ${fk.onDelete}`,
      );
    }
    lines.push("");
  }

  const summary = `-- summary: ${reports.length} queries with scan/search activity, ${unindexedTotal} fixable scans, ${droppable.length} drop candidates, ${fkLoadBearing.length} FK-cascade-load-bearing indexes`;
  lines.push(summary);
  const output = lines.join("\n") + "\n";

  if (args.out) writeFileSync(resolve(args.out), output);
  else process.stdout.write(output);

  db.close();
}

main();
