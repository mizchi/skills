import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./check-worker-bundle.ts", import.meta.url));

test("checks all emitted Vite modules, including corruption outside the main module", () => {
  const dir = mkdtempSync(join(tmpdir(), "cf-bundle-test-"));
  try {
    const nested = join(dir, "chunks");
    mkdirSync(nested);
    writeFileSync(join(dir, "index.js"), "import './chunks/core.js';");
    writeFileSync(join(nested, "core.js"), "// MoonBit core\n" + "x".repeat(1100));
    const run = () => spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    writeFileSync(join(nested, "core.js"), "x".repeat(1100) + "\x1f");
    const corrupt = run();
    assert.equal(corrupt.status, 1);
    assert.match(corrupt.stderr, /corrupt/i);
    writeFileSync(join(nested, "core.js"), "stub");
    assert.equal(run().status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
