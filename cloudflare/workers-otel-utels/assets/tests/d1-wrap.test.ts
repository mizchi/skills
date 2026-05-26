import assert from "node:assert/strict";
import { test } from "node:test";

import {
  d1QuerySpan,
  d1SlowThreshold,
  detectDbOperation,
  detectDbTable,
  truncateStatement,
  wrapD1Bindings,
  wrapD1Database,
  wrapD1PreparedStatement,
} from "../src/telemetry/d1-wrap.mjs";

// --- Mock D1 ---------------------------------------------------------

function makeMockStatement(sql, behavior) {
  const stmt = {
    sql,
    boundArgs: undefined,
    bind(...args) {
      const child = makeMockStatement(sql, behavior);
      child.boundArgs = args;
      return child;
    },
    async first() {
      if (behavior?.throw) throw behavior.throw;
      return behavior?.first ?? null;
    },
    async run() {
      if (behavior?.throw) throw behavior.throw;
      return behavior?.run ?? { success: true };
    },
    async all() {
      if (behavior?.throw) throw behavior.throw;
      return behavior?.all ?? { results: [], meta: {} };
    },
    async raw() {
      if (behavior?.throw) throw behavior.throw;
      return behavior?.raw ?? [];
    },
  };
  return stmt;
}

function makeMockDb({ behavior = {}, onPrepare } = {}) {
  return {
    prepare(sql) {
      onPrepare?.(sql);
      return makeMockStatement(sql, behavior);
    },
    async batch(statements) {
      if (behavior.throw) throw behavior.throw;
      return statements.map(() => ({ success: true }));
    },
    async exec(sql) {
      if (behavior.throw) throw behavior.throw;
      return { count: 1, duration: 0, sql };
    },
  };
}

// --- detectDbOperation -----------------------------------------------

test("detectDbOperation: leading whitespace + case-insensitive", () => {
  assert.equal(detectDbOperation("  select * from t"), "SELECT");
  assert.equal(detectDbOperation("INSERT INTO t ..."), "INSERT");
  assert.equal(detectDbOperation("update t set ..."), "UPDATE");
  assert.equal(detectDbOperation("WITH cte AS (...) SELECT ..."), "WITH");
});

test("detectDbOperation: unknown verb -> OTHER", () => {
  assert.equal(detectDbOperation("VACUUM"), "OTHER");
  assert.equal(detectDbOperation(""), "OTHER");
  assert.equal(detectDbOperation(null), "OTHER");
});

// --- detectDbTable ----------------------------------------------------

test("detectDbTable: FROM / INTO / UPDATE / JOIN", () => {
  assert.equal(detectDbTable("SELECT * FROM users WHERE id = ?"), "users");
  assert.equal(detectDbTable("INSERT INTO memory_entries (a) VALUES (?)"), "memory_entries");
  assert.equal(detectDbTable("UPDATE skills SET name = ? WHERE slug = ?"), "skills");
  assert.equal(detectDbTable("SELECT * FROM a JOIN b ON ..."), "a");
});

test("detectDbTable: undefined when no candidate", () => {
  assert.equal(detectDbTable("PRAGMA foreign_keys = ON"), undefined);
  assert.equal(detectDbTable(""), undefined);
});

// --- truncateStatement ------------------------------------------------

test("truncateStatement: <=500 chars passes through", () => {
  const s = "SELECT 1";
  assert.equal(truncateStatement(s), s);
});

test("truncateStatement: >500 chars truncated with ellipsis", () => {
  const s = "a".repeat(600);
  const out = truncateStatement(s);
  assert.equal(out.length, 503); // 500 + "..."
  assert.ok(out.endsWith("..."));
});

// --- d1SlowThreshold --------------------------------------------------

test("d1SlowThreshold: default 200 when unset", () => {
  assert.equal(d1SlowThreshold({}), 200);
  assert.equal(d1SlowThreshold({ MNEMO_D1_SLOW_THRESHOLD_MS: "" }), 200);
});

test("d1SlowThreshold: numeric env wins", () => {
  assert.equal(d1SlowThreshold({ MNEMO_D1_SLOW_THRESHOLD_MS: "1" }), 1);
  assert.equal(d1SlowThreshold({ MNEMO_D1_SLOW_THRESHOLD_MS: "500" }), 500);
});

test("d1SlowThreshold: non-numeric falls back to default", () => {
  assert.equal(d1SlowThreshold({ MNEMO_D1_SLOW_THRESHOLD_MS: "abc" }), 200);
  assert.equal(d1SlowThreshold({ MNEMO_D1_SLOW_THRESHOLD_MS: "-5" }), 200);
});

// --- wrapD1PreparedStatement -----------------------------------------

test("wrap: prepare → all records the SQL + binding + op", async () => {
  const records = [];
  const db = wrapD1Database(makeMockDb(), "DB", (q) => records.push(q));
  const stmt = db.prepare("SELECT * FROM users");
  await stmt.all();

  assert.equal(records.length, 1);
  assert.equal(records[0].bindingName, "DB");
  assert.equal(records[0].op, "all");
  assert.equal(records[0].sql, "SELECT * FROM users");
  assert.equal(records[0].ok, true);
  assert.ok(typeof records[0].durationMs === "number");
  assert.ok(records[0].durationMs >= 0);
  assert.ok(typeof records[0].startNs === "string"); // ns-as-string (BigInt-style)
  assert.ok(typeof records[0].endNs === "string");
});

test("wrap: bind() chain preserves SQL through to terminal op", async () => {
  const records = [];
  const db = wrapD1Database(makeMockDb(), "DB_SHARD_00", (q) => records.push(q));
  await db.prepare("SELECT ? AS x").bind(1).first();
  await db.prepare("SELECT ? AS y").bind(2).bind(3).run();

  assert.equal(records.length, 2);
  assert.equal(records[0].sql, "SELECT ? AS x");
  assert.equal(records[0].op, "first");
  assert.equal(records[0].bindingName, "DB_SHARD_00");
  assert.equal(records[1].sql, "SELECT ? AS y");
  assert.equal(records[1].op, "run");
});

test("wrap: all four terminal ops trigger a record", async () => {
  const records = [];
  const db = wrapD1Database(makeMockDb(), "DB", (q) => records.push(q));
  await db.prepare("SELECT 1").first();
  await db.prepare("SELECT 2").run();
  await db.prepare("SELECT 3").all();
  await db.prepare("SELECT 4").raw();

  assert.deepEqual(records.map((r) => r.op), ["first", "run", "all", "raw"]);
});

test("wrap: thrown error still records with ok=false", async () => {
  const records = [];
  const err = new Error("boom");
  const db = wrapD1Database(
    makeMockDb({ behavior: { throw: err } }),
    "DB",
    (q) => records.push(q),
  );
  await assert.rejects(() => db.prepare("SELECT 1").all(), /boom/);

  assert.equal(records.length, 1);
  assert.equal(records[0].ok, false);
  assert.equal(records[0].op, "all");
});

test("wrap: batch() records batch op with synthetic SQL", async () => {
  const records = [];
  const db = wrapD1Database(makeMockDb(), "DB", (q) => records.push(q));
  await db.batch([
    db.prepare("INSERT INTO t VALUES (1)"),
    db.prepare("INSERT INTO t VALUES (2)"),
  ]);

  // batch produces 1 record; the prepare() calls also each create a
  // statement (but no terminal op was called on them so no record from
  // the wrap path).
  const batchRecord = records.find((r) => r.op === "batch");
  assert.ok(batchRecord, "expected a batch record");
  assert.equal(batchRecord.bindingName, "DB");
  assert.equal(batchRecord.sql, "BATCH(2)");
});

test("wrap: exec() records exec op with the raw SQL", async () => {
  const records = [];
  const db = wrapD1Database(makeMockDb(), "DB", (q) => records.push(q));
  await db.exec("PRAGMA foreign_keys = ON");

  assert.equal(records.length, 1);
  assert.equal(records[0].op, "exec");
  assert.equal(records[0].sql, "PRAGMA foreign_keys = ON");
});

// --- wrapD1Bindings ---------------------------------------------------

test("wrapD1Bindings: only wraps values with a prepare() method", async () => {
  const records = [];
  const fakeBinding = makeMockDb();
  const env = {
    DB: fakeBinding,
    DB_SHARD_00: makeMockDb(),
    NOT_A_DB: { foo: "bar" },     // plain object — pass through
    SOMETHING: "string",           // primitive — pass through
    NULL_VALUE: null,
  };
  const wrapped = wrapD1Bindings(env, (q) => records.push(q));

  // Non-D1 values are untouched.
  assert.equal(wrapped.NOT_A_DB, env.NOT_A_DB);
  assert.equal(wrapped.SOMETHING, "string");
  assert.equal(wrapped.NULL_VALUE, null);

  // D1 bindings record on terminal op.
  await wrapped.DB.prepare("SELECT 1").first();
  await wrapped.DB_SHARD_00.prepare("SELECT 2").run();

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((r) => r.bindingName).sort(),
    ["DB", "DB_SHARD_00"],
  );
});

test("wrapD1Bindings: non-object env returned as-is", () => {
  const noop = () => {};
  assert.equal(wrapD1Bindings(null, noop), null);
  assert.equal(wrapD1Bindings(undefined, noop), undefined);
  assert.equal(wrapD1Bindings("x", noop), "x");
});

test("wrapD1Database: passthrough when target has no prepare", () => {
  const target = { foo: 1 };
  assert.equal(wrapD1Database(target, "X", () => {}), target);
});

// --- d1QuerySpan ------------------------------------------------------

test("d1QuerySpan: shape + attributes", () => {
  const toKeyValues = (attrs) =>
    Object.entries(attrs).map(([key, value]) => ({ key, value }));
  const randomHex = () => "deadbeef";

  const span = d1QuerySpan(
    { traceId: "trace-1", spanId: "parent-1" },
    {
      bindingName: "DB",
      op: "all",
      sql: "SELECT id FROM users WHERE handle = ?",
      startNs: "1000",
      endNs: "2000",
      durationMs: 13,
      ok: true,
    },
    { toKeyValues, randomHex },
  );

  assert.equal(span.traceId, "trace-1");
  assert.equal(span.parentSpanId, "parent-1");
  assert.equal(span.kind, 3);
  assert.equal(span.name, "d1.select users");
  assert.equal(span.startTimeUnixNano, "1000");
  assert.equal(span.endTimeUnixNano, "2000");
  const attrs = Object.fromEntries(span.attributes.map((kv) => [kv.key, kv.value]));
  assert.equal(attrs["db.system"], "cloudflare.d1");
  assert.equal(attrs["db.operation"], "SELECT");
  assert.equal(attrs["db.sql.table"], "users");
  assert.equal(attrs["mnemo.d1.binding"], "DB");
  assert.equal(attrs["mnemo.d1.method"], "all");
  assert.equal(attrs["mnemo.d1.duration_ms"], 13);
});

test("d1QuerySpan: status code 2 on failure", () => {
  const span = d1QuerySpan(
    { traceId: "t", spanId: "s" },
    { bindingName: "DB", op: "all", sql: "X", startNs: "0", endNs: "1", durationMs: 1, ok: false },
    { toKeyValues: () => [], randomHex: () => "x" },
  );
  assert.deepEqual(span.status, { code: 2 });
});

test("d1QuerySpan: name omits table when undetectable", () => {
  const span = d1QuerySpan(
    { traceId: "t", spanId: "s" },
    { bindingName: "DB", op: "exec", sql: "PRAGMA foreign_keys", startNs: "0", endNs: "1", durationMs: 1, ok: true },
    { toKeyValues: () => [], randomHex: () => "x" },
  );
  // PRAGMA has no table reference, but operation parses as PRAGMA;
  // the name is just `d1.pragma` (no trailing table fragment).
  assert.equal(span.name, "d1.pragma");
});
