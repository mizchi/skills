---
name: sql-security
description: "SQL injection screening for host code (MoonBit / TS / Rust) plus secretlint setup notes. Flags single-line template-literal or string-concat SQL builders, regardless of value source — the scanner is line-based and does NOT trace data flow, so a clean scan is not proof of safety (multi-line template literals are missed) and every hit needs a manual review or an explicit `// sql-security: ok` opt-out."
version: 0.1.0
metadata:
  hermes:
    tags: [sql, security, sqlite, d1, dba, sqli, secrets]
    related_skills: [sql-plan-audit, sql-lint, sql-schema-audit]
    engines: [sqlite, postgres, mysql]
---

# SQL Security

Use this when a project ships SQL through host code (MoonBit / TS / Rust / Go) and wants a cheap line of defence against the two recurring sources of SQL-domain incidents:

1. **SQL injection**: a string template that interpolates a value into a SQL fragment instead of binding it through a placeholder.
2. **Secrets in queries**: a hardcoded token or connection string that leaks into git history. Handled by `secretlint`, not this skill — see "Companion: secretlint" below.

## sql-injection-scan.mjs

```bash
node scripts/sql-injection-scan.mjs your-project/src
```

The scanner walks the directory, ignores generated files (`db/gen/`, `sqlc_*.mbt`, `*.test.mbt`, `_build/`, `dist/`, `target/`), and flags:

- **template-interp**: a backtick string literal that *starts with* a SQL keyword (`SELECT`, `INSERT INTO`, `WHERE`, `AND (`, ...) AND contains a `${...}` placeholder. Example: `` `WHERE c.vector_id IN (${placeholders})` ``.
- **string-concat**: a quoted SQL string adjacent to a `+` and an identifier. Example: `"SELECT * FROM " + table`.

The keyword match is **case-sensitive on purpose** — `from` / `where` / `join` appear constantly in English prose and would generate hundreds of false positives if matched case-insensitively.

The scanner exits 1 on findings — every hit deserves a manual review even if it turns out to be safe.

### Limitations — a clean scan is NOT proof of safety

The scanner reads **one line at a time**. Its template-literal rule requires the opening backtick, the `${...}` placeholder, and the closing backtick to all sit on a **single physical line**. Consequences:

- **Multi-line template literals are silently missed.** A query whose backtick opens on one line and whose `${value}` lands on a continuation line (a common formatting style) produces **zero findings and exit 0**, even though it is a genuine injection. Example the scanner does NOT catch:

  ```ts
  const sql = `
    SELECT id FROM users
    WHERE name = ${name}   // <-- real injection, not flagged
  `;
  ```

- **Exit 0 means "no single-line hits found," never "safe."** When reviewing for SQL injection, also read any multi-line or programmatically-assembled SQL by hand; do not treat a clean scan as a pass. Fold a multi-line query onto one line if you want the scanner to see it.

This is a deliberate cost/coverage trade-off (zero-dep, no parser), not a bug — but it is a blind spot you must compensate for in review.

## Reading the findings

A finding does not automatically mean injection. Many legitimate cases exist:

- **Internal placeholder expansion**: building `?,?,?,...,?` for an IN clause from a server-derived count. The interpolated value is `?`, never user input. Annotate with the opt-out comment so future scans can ignore it.
- **FTS5 / vector queries that sqlc cannot parse**: dynamic clause builders that interpolate column lists or `?` counts. User input still passes through `.bind(...)`.
- **Inline migration scripts** building DDL at deploy time.

The scanner is intentionally noisy because the cost of missing one real SQLi is much higher than the cost of triaging a list of 5 false positives.

## Opt-out marker

To silence a known-safe line, add a comment with the marker `sql-security: ok` either on the same line or on the line above:

```ts
// sql-security: ok (placeholders is server-derived `?` count, values bind separately)
const sql = `WHERE c.vector_id IN (${placeholders})`;
```

The scanner accepts `//` (TS / MoonBit / Rust / Go) and `#` (Python / shell) comment markers.

## Companion: secretlint

For credential leakage (the other half of "SQL security"), use `secretlint`. Recommended setup for a pkfire-managed repo's pre-push hook:

```bash
pnpm add -D secretlint @secretlint/secretlint-rule-preset-recommend
```

Then run on pre-push:

```bash
pnpm exec secretlint --secretlintignore .gitignore "**/*"
```

This is per-repo and complements any user-global secretlint configuration. The `mizchi/skills/pkfire` skill has a ready-made recipe at `assets/recipes/14-secretlint-pre-push.pkl` for projects using pkfire hooks.

## When to invoke

- **pre-push**: cheap, runs once before sending code to the remote.
- **pre-commit**: optional. `secretlint` here can be slow on large diffs; `sql-injection-scan` is cheap enough.
- **PR review**: paste the scanner output into the review checklist.

## Not in scope

- **Stored XSS / template injection**: these go through frontend / templating layers, not SQL.
- **Authz bypasses**: row-level access checks are app logic, not a SQL concern.
- **DoS via expensive query**: covered by `sql-plan-audit` (look for new SCAN entries) and rate limiting at the edge.

## Engine extensibility

The scanner regex is engine-agnostic. The SQL-keyword set works for SQLite / Postgres / MySQL out of the box. Add `RETURNING` / `OVERLAPS` / `LIMIT OFFSET` if a Postgres-heavy project needs broader coverage.

## Requirements

- Node 20 or newer.

## Files

- `scripts/sql-injection-scan.mjs` — zero-dep text scanner.
