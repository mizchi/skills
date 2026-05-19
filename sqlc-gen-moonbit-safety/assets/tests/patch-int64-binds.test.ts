import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile, readFile, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// We test the script by setting up a tmp project layout that mirrors
// mnemo-server's structure (just `src/db/gen/{sqlc_types,sqlc_queries}.mbt`
// plus the script file at `scripts/patch-int64-binds.mjs`) and running
// the script with --verify / apply against it.

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT_SRC = join(REPO_ROOT, "scripts/patch-int64-binds.mjs");

const TYPES_SAMPLE = `\
///|
pub struct ListThingsParams {
  handle : String
  limit : Int64
  offset : Int64
  flag : Bool
}

///|
pub struct GetThingParams {
  id : String
  size : Int64?
}
`;

const QUERIES_SAMPLE_BANNER = `\
///| Read a required field
fn _placeholder_required_field() -> Unit { () }
`;

function makeQueriesFile({ wrappedLimit = true, helperPresent = true } = {}) {
  const limitBind = wrappedLimit
    ? "@core.any(int64_bind_safe(params.limit))"
    : "@core.any(params.limit)";
  const helper = helperPresent
    ? `///|
extern "js" fn int64_bind_safe(value : Int64) -> @core.Any =
  #| (n) => Number(n)

`
    : "";
  return (
    helper +
    QUERIES_SAMPLE_BANNER +
    `
pub async fn list_things(db : @cloudflare.D1Database, params : ListThingsParams) -> Unit {
  let stmt = db.prepare("SELECT 1")
  stmt.bind([
    @core.any(params.handle),
    ${limitBind},
    @core.any(int64_bind_safe(params.offset))
  ]).all().wait()
}

pub async fn get_thing(db : @cloudflare.D1Database, params : GetThingParams) -> Unit {
  let stmt = db.prepare("SELECT 1")
  stmt.bind([@core.any(params.id)]).all().wait()
}
`
  );
}

async function makeTempProject() {
  const root = await mkdtemp(join(tmpdir(), "patch-int64-test-"));
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "src/db/gen"), { recursive: true });
  await copyFile(SCRIPT_SRC, join(root, "scripts/patch-int64-binds.mjs"));
  await writeFile(join(root, "src/db/gen/sqlc_types.mbt"), TYPES_SAMPLE);
  return root;
}

function runScript(root, args = []) {
  return spawnSync("node", ["scripts/patch-int64-binds.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("verify: passes on a freshly patched file", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: true, helperPresent: true }),
    );
    const r = runScript(root, ["--verify"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /--verify: OK/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify: fails with exit 1 when an Int64 bind site is unwrapped", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: false, helperPresent: true }),
    );
    const r = runScript(root, ["--verify"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unwrapped Int64 bind site/);
    assert.match(r.stderr, /list_things :: ListThingsParams\.limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify: fails when the helper extern is missing", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: true, helperPresent: false }),
    );
    const r = runScript(root, ["--verify"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /int64_bind_safe helper extern is missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply: wraps an unwrapped Int64 bind site and injects helper", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: false, helperPresent: false }),
    );
    const r = runScript(root, []);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /wrapped 1 Int64 bind site/);
    const patched = await readFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      "utf8",
    );
    assert.match(patched, /@core\.any\(int64_bind_safe\(params\.limit\)\)/);
    assert.match(patched, /extern "js" fn int64_bind_safe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply: no-op when file is already fully patched", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: true, helperPresent: true }),
    );
    const r = runScript(root, []);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no Int64 bind sites needed patching/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify error message includes the build-gate justification", async () => {
  const root = await makeTempProject();
  try {
    await writeFile(
      join(root, "src/db/gen/sqlc_queries.mbt"),
      makeQueriesFile({ wrappedLimit: false, helperPresent: true }),
    );
    const r = runScript(root, ["--verify"]);
    assert.equal(r.status, 1);
    // The diagnostic must point at the build-gate rationale so the
    // operator hitting this 6 months later doesn't have to spelunk PRs.
    assert.match(r.stderr, /mnemo #79|D1.*hang|BigInt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
