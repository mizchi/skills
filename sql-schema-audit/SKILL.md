---
name: sql-schema-audit
description: Index coverage and N+1 review aids for SQLite/D1 schemas with a sqlc catalog. Surfaces unused indexes (with FK CASCADE awareness so cascade-load-bearing indexes are not flagged), queries that scan tables without index help, and `for`-loops calling generated SQL fns.
version: 0.1.0
metadata:
  hermes:
    tags: [sql, sqlite, d1, dba, schema, indexes, n+1]
    related_skills: [sql-plan-audit, sql-lint, sql-security]
    engines: [sqlite]
---

# SQL Schema Audit

Use this for two recurring DBA review tasks:

1. **Where is index work missing?** Walk every query plan and attribute each `SCAN <table>` to either a known intentional case (no covering index possible) or a gap (table has no indexes at all).
2. **Where might code N+1?** Find `for`-loops that call sqlc-generated functions — review aid, not a hard fail, because batch inserts are legitimate.

## index-coverage.mjs

```bash
# `scripts/` is relative to THIS skill's directory; from elsewhere use the
# absolute path. `--out` is OPTIONAL — omit it and the report prints to stdout.
# The printed report IS the deliverable; the file is just a persisted copy.
node scripts/index-coverage.mjs \
  --schema your-project/db/schema.sql \
  --queries your-project/db/queries.sql \
  [--out your-project/.linters/index-coverage.txt]
```

Output sections:

- **Per-query SCAN attribution**: each query that produces a `SCAN` step is listed with the SCAN's rationale. `FIX` marker means the table has no indexes at all (immediate work). No marker means the table has indexes but the planner chose to scan anyway — usually fine (small table, unusual WHERE shape).
- **Drop candidates**: indexes that no catalog query referenced via `SEARCH USING INDEX` *and* don't cover any FK CASCADE source column.
- **FK-cascade-load-bearing indexes**: unused-by-SELECT indexes whose leading columns match a foreign key's `from` list. SQLite does NOT auto-create indexes on FK columns; without an explicit index, `ON DELETE CASCADE` walks the child table with a full scan. These look "unused" but are load-bearing for delete latency.

The FK-awareness step matters: in a typical schema with many `owner_user_id` foreign keys, most "unused" indexes are actually serving cascade deletes. Dropping them silently regresses delete performance.

## When dropping a candidate

Cross-check before dropping:

1. The audit only inspects sqlc-managed queries. Inline SQL (FTS5 `MATCH`, dynamic `LIKE`, vector lookups) bypasses the audit. Grep the codebase for the index name or its column combination before dropping.
2. The planner may pick the index dynamically for shapes the static EXPLAIN doesn't replicate (e.g. when a different bind value distribution changes the chosen index). A drop candidate is "no SELECT picks it in the analyzed catalog" — that's necessary, not sufficient.
3. An index that's logically "redundant to" a superset index can usually be dropped — the planner will fall through to the longer index. Verify with `sql-plan-audit` after the drop to make sure no query regressed to SCAN.

## n-plus-one.mjs

```bash
node scripts/n-plus-one.mjs your-project/src
```

Regex-based scan for `for`-loops that call a sqlc-generated function within 12 lines. Tunable:

- `--callee-prefix @db.,db.` to match other binding styles (Rust `state.db.`, Go `q.`, etc.).
- `--window 20` to widen the look-ahead.

The script returns 0 always — N+1 candidates need human review. Use it as a review aid, not a CI gate.

Most candidates in well-typed codebases are legitimate batch inserts (`create_skill_file` inside `for file in files`, `add_skill_tag` inside `for tag in tags`). One genuine SELECT-in-loop is the kind of thing this report exists to catch.

## When to invoke

- After a schema change (added or removed index).
- Before a release: a one-time "what's unused?" pass.
- When a feature lands a `for`-loop touching the DB — eyeball the n-plus-one report.

## Not in scope

- **Schema drift between code and production**: needs reading the live DB schema and diffing against `schema.sql`. Out of scope here.
- **CHECK / NOT NULL audit**: schemalint or similar. Probably worth a follow-up skill.
- **EXPLAIN ANALYZE / actual row counts**: SQLite doesn't expose them statically.

## Engine extensibility

The PRAGMA-based introspection (`PRAGMA index_list`, `PRAGMA index_info`, `PRAGMA foreign_key_list`) is SQLite-specific. For Postgres: query `pg_indexes` + `pg_stat_user_indexes` (which gives actual usage counts — much more accurate than the EXPLAIN-based heuristic) + `information_schema.referential_constraints`. For MySQL: `information_schema.STATISTICS` + `information_schema.KEY_COLUMN_USAGE`.

The N+1 detector is engine-agnostic, but the `--callee-prefix` heuristic depends on codegen conventions (sqlc / sqlx / typeorm / prisma).

## Requirements

- Node 22 or newer (uses the built-in `node:sqlite` module).
- A sqlc-style query catalog or compatible format.

## Files

- `scripts/index-coverage.mjs` — per-query SCAN attribution + drop candidates + FK-cascade-load-bearing list.
- `scripts/n-plus-one.mjs` — `for`-loop sqlc-call detector.
