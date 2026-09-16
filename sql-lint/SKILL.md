---
name: sql-lint
description: Static lint for sqlc-style SQL catalogs. Catches duplicate query names, missing semicolons, SELECT *, double-wildcard LIKE, and other cheap-but-easy-to-miss mistakes. Optional sqlfluff integration for full style coverage.
version: 0.1.0
metadata:
  hermes:
    tags: [sql, sqlite, d1, dba, lint, sqlc]
    related_skills: [sql-plan-audit, sql-schema-audit, sql-security]
    engines: [sqlite, postgres, mysql]
---

# SQL Lint

Use this when a project has a SQL catalog (`-- name: X :type` comments or any named-query convention) and wants to enforce basic hygiene without adopting a heavy SQL linter.

## Two layers

This skill ships **two** linters, with different cost / coverage trade-offs.

### Layer 1: catalog-lint (built-in, zero deps)

`scripts/catalog-lint.mjs` is a Node 20+ script with no dependencies. It catches:

- **duplicate-name**: two queries with the same `-- name: X` header. Some codegens silently shadow; others break.
- **missing-semicolon**: queries that omit the trailing `;`. sqlc rejects these at build time, but catalog-lint surfaces them in fmt-time.
- **empty-body**: header with no SQL body.
- **malformed-name**: `-- name:` line that doesn't match `name: X :type`.
- **select-star**: `SELECT *` (always over-fetch).
- **double-wildcard-like**: `LIKE '%...%'` (full-table scan risk).

Run (this is the default first pass — start here before reaching for sqlfluff):

```bash
# `scripts/` is relative to THIS skill's directory. From elsewhere, use the
# absolute path, e.g. node "$CLAUDE_SKILLS_DIR/sql-lint/scripts/catalog-lint.mjs".
node scripts/catalog-lint.mjs your-project/db/queries.sql
echo "exit=$?"   # 0 = clean, 1 = findings — the exit code IS the pass/fail signal
```

Exits 0 on clean / 1 on findings. Output is `file:line: [rule] message`, parseable by editor diagnostic gutters. Note: for `select-star` and `double-wildcard-like`, the reported line is the query's `-- name:` header, not the offending SQL line.

### Layer 2: sqlfluff (optional, opt-in)

For full style coverage — keyword case, indentation, alias names, etc. — use `sqlfluff`. The skill ships `.sqlfluff` tuned for SQLite/D1 + sqlc catalogs:

```bash
uvx sqlfluff lint --config .sqlfluff your-project/db/queries.sql
```

`uvx` (from astral.sh/uv) runs sqlfluff in an ephemeral venv; nothing is installed permanently. If `uv` is missing, fall back to `pip install sqlfluff` or `pipx install sqlfluff`.

The shipped config disables a few sqlfluff rules:

- `AM04` (SELECT *) is handled by catalog-lint with better context.
- `CP02` (column case) is too noisy on JSON path references like `obj.field_name`.
- `L009` (trailing newline) is enforced by git.

## When to invoke

- Every commit that touches the query catalog (pre-commit / pre-push hook).
- Once per migration milestone, run sqlfluff for the full style pass.

## Inline SQL in host code

This skill does **not** police inline SQL in MoonBit / Rust / Go / etc. — `ast-grep` is the right tool there, but it requires per-language tree-sitter support. For host languages without a tree-sitter grammar (e.g. MoonBit), a text-grep baseline file (`.linters/inline-sql-baseline.json`) works: count `.prepare(` occurrences per file and refuse increases.

The companion `sql-security` skill documents the same approach for SQL injection.

## CI integration

```just
sql-lint:
    node scripts/catalog-lint.mjs db/queries.sql
```

For full sqlfluff in CI, run a separate `sql-lint-style` step so the cheap catalog-lint can fail fast.

## Engine extensibility

`catalog-lint.mjs` is engine-agnostic — the rules look at SQL comments, semicolons, and basic patterns. Adapt to MySQL / Postgres by changing the sqlfluff `dialect = sqlite` line in `.sqlfluff`.

## Requirements

- Node 20 or newer for `scripts/catalog-lint.mjs`.
- (Optional) `uv` / `pipx` / `pip` for sqlfluff.

## Files

- `scripts/catalog-lint.mjs` — zero-dep catalog linter.
- `.sqlfluff` — opt-in sqlfluff config (SQLite dialect; change `dialect = ...` for other engines).
