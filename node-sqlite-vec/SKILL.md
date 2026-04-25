---
name: node-sqlite-vec
description: Set up Node 24+ built-in `node:sqlite` with the loadable `sqlite-vec` extension for vector / RAG storage in TypeScript, without `better-sqlite3`. Covers extension loading, vec0 BigInt rowids, vitest incompatibility (use `node --test`), tsconfig flags for `.ts` imports, and a CLI shebang.
---

# node-sqlite-vec

Recipe for combining Node 24's built-in `node:sqlite` with the [`sqlite-vec`](https://github.com/asg017/sqlite-vec) extension. Each section below is a known pitfall paired with the working incantation — read the **Pitfalls** section first if you only have a minute.

## When to use

- Adding vector search / RAG storage to a Node 24+ project
- You want to avoid the native build dance of `better-sqlite3`
- TypeScript source that runs directly with `--experimental-strip-types`

Skip this skill if:

- Your runtime is Node ≤ 22 (no built-in `node:sqlite`) — use `better-sqlite3`
- You need server-grade concurrency / replication — SQLite is the wrong tool

## Pitfalls (read first)

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to load url sqlite (resolved id: sqlite)` from vitest | vite strips the `node:` prefix and looks up plain `sqlite`, which does not exist | Drop vitest. Use `node --test` (built-in, no vite layer) |
| `ERR_SQLITE_ERROR: Only integers are allows for primary key values on <table>_vec` on insert | JS `number` gets bound as REAL; `vec0` virtual tables require strict integer rowids | Wrap rowid bindings with `BigInt(id)` |
| `loadExtension is not a function` or "Not authorized to use load_extension" | Both extension-load gates must be opened | `new DatabaseSync(path, { allowExtension: true })` **and** `db.enableLoadExtension(true)` |
| `ExperimentalWarning: SQLite is an experimental feature` printed every CLI run | Node 24 emits this for any `node:sqlite` import | `#!/usr/bin/env -S node --no-warnings=ExperimentalWarning` in the bin shebang |
| `An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled` | tsc rejects `import "./x.ts"` by default; `--experimental-strip-types` requires `.ts` extensions | Set `allowImportingTsExtensions: true` and `rewriteRelativeImportExtensions: true` in `tsconfig.json` |

## Setup

### Dependencies

```sh
pnpm add sqlite-vec
pnpm add -D @types/node typescript
```

No `better-sqlite3`, no `bindings`, no `node-gyp`.

### tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "allowImportingTsExtensions": true,    // import "./x.ts" allowed in source
    "rewriteRelativeImportExtensions": true, // tsc emits "./x.js" in output
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

`rewriteRelativeImportExtensions` lets you keep `.ts` imports in source (so `node --experimental-strip-types tests/x.test.ts` works) while still producing valid `.js` output via `tsc`.

### package.json scripts

```jsonc
{
  "scripts": {
    "build": "tsc",
    "test": "node --experimental-strip-types --experimental-sqlite --test --test-reporter=spec tests/*.test.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

`--experimental-sqlite` is currently still required on Node ≤ 24.x; on Node 25+ where `node:sqlite` is stable, it is a no-op.

## Open + load extension

```ts
// src/db.ts
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

export function openDB(path: string) {
  const db = new DatabaseSync(path, { allowExtension: true });
  db.enableLoadExtension(true);
  sqliteVec.load(db);
  db.enableLoadExtension(false); // re-disable after load (defense in depth)
  return db;
}
```

Both `allowExtension: true` (constructor) **and** `enableLoadExtension(true)` (instance) are required. If either is missing, the load throws.

Verify:

```ts
const row = db.prepare("SELECT vec_version() AS v").get();
console.log(row.v); // → "v0.1.9"
```

## Schema: vec0 virtual table

```ts
const EMBEDDING_DIM = 1024;
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.exec(
  `CREATE VIRTUAL TABLE IF NOT EXISTS item_vec USING vec0(embedding FLOAT[${EMBEDDING_DIM}]);`,
);
```

Keep the regular table (`items`) and the vector table (`item_vec`) joined by `id` ↔ `rowid`.

## Insert: the BigInt rowid trap

```ts
const insertItem = db.prepare(
  `INSERT INTO items (body) VALUES (?) RETURNING id`,
);
const insertVec = db.prepare(
  `INSERT INTO item_vec (rowid, embedding) VALUES (?, ?)`,
);

function add(body: string, embedding: Float32Array): number {
  const { id } = insertItem.get(body) as { id: number };

  // ❌ insertVec.run(id, blob)
  //    → ERR_SQLITE_ERROR: Only integers are allows for primary key values on item_vec
  //
  // ✅ Wrap with BigInt to force INTEGER affinity:
  insertVec.run(
    BigInt(id),
    new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength),
  );
  return id;
}
```

Apply the same `BigInt(id)` wrap to **every** vec0 binding: `DELETE FROM item_vec WHERE rowid = ?`, etc. The regular `items` table does not need this — only `vec0` virtual tables enforce strict integer rowids.

The embedding goes in as a raw little-endian float buffer (`Uint8Array` view over a `Float32Array`).

## KNN query

```ts
const sql = `
  SELECT i.id, i.body, v.distance
  FROM item_vec AS v
  JOIN items AS i ON i.id = v.rowid
  WHERE v.embedding MATCH ? AND v.k = ?
  ORDER BY v.distance ASC
  LIMIT ?
`;
const blob = new Uint8Array(query.buffer, query.byteOffset, query.byteLength);
const rows = db.prepare(sql).all(blob, k, k);
```

`v.k = ?` pre-filters to the top-k inside vec0; the outer `LIMIT` is the same number for clarity. When you also need a non-vector filter (e.g. `WHERE kind = 'X'`), pull more candidates via a larger `v.k` so the secondary filter does not starve.

## Testing: do NOT use vitest

vitest depends on vite, and vite's resolver strips the `node:` prefix when resolving imports. `node:sqlite` has no plain-name fallback, so vitest fails before any test runs:

```
Error: Failed to load url sqlite (resolved id: sqlite). Does the file exist?
```

Use Node's built-in test runner instead:

```ts
// tests/db.test.ts
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDB } from "../src/db.ts";

let dir: string;
let db: ReturnType<typeof openDB>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spike-"));
  db = openDB(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("vec0", () => {
  it("loads sqlite-vec", () => {
    const row = db.prepare("SELECT vec_version() AS v").get() as { v: string };
    assert.match(row.v, /^v\d+\.\d+\.\d+/);
  });
});
```

```sh
node --experimental-strip-types --experimental-sqlite --test tests/*.test.ts
```

Real DB, no mocks. `node:test` outputs TAP by default; pass `--test-reporter=spec` for the readable form.

## CLI shebang

```ts
#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
import { DatabaseSync } from "node:sqlite";
// ...
```

`env -S` splits the rest of the shebang on whitespace so you can pass flags. Without `--no-warnings=ExperimentalWarning`, every CLI invocation prints:

```
(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

This becomes annoying in scripts that capture stderr. Suppress it at the entry point only — keep it visible during development if you want.

## When Node 25+ ships

- `--experimental-sqlite` becomes a no-op (`node:sqlite` is stable)
- The `ExperimentalWarning` goes away — drop `--no-warnings=ExperimentalWarning` from the shebang
- Everything else (BigInt rowids, vitest avoidance, tsconfig flags) is independent of stability and continues to apply

## References

- [`sqlite-vec`](https://github.com/asg017/sqlite-vec) — the loadable vector extension
- [Node.js `node:sqlite` docs](https://nodejs.org/api/sqlite.html)
- [Node.js test runner](https://nodejs.org/api/test.html)
