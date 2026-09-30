import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./setup-utels.ts", import.meta.url));
const ingestToken = "test-ingest-secret-not-for-argv";

test("sends the secret as a JSON stdin body to cf and selects the staging Worker explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cf-utels-test-"));
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ tokens: { ingest: { token: ingestToken } } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    const fakePnpm = join(dir, "pnpm");
    await writeFile(fakePnpm, `#!${process.execPath}\n` + `
const fs = require('node:fs');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.CF_TEST_CAPTURE, JSON.stringify({ args: process.argv.slice(2), input }));
  // Even if the CLI reports a request body, the helper must not expose it.
  process.stdout.write(input);
  process.stderr.write(input);
  process.exit(Number(process.env.CF_TEST_EXIT || 0));
});
`);
    await chmod(fakePnpm, 0o755);
    const capture = join(dir, "request.json");
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      DRY_RUN: "0",
      UTELS_BOOTSTRAP_TOKEN: "test-bootstrap",
      UTELS_ENDPOINT: `http://127.0.0.1:${address.port}`,
      APP_SERVER_DIR: dir,
      APP_WORKER_STAGING: "test-worker-staging",
      CF_TEST_CAPTURE: capture,
    };
    const run = (extraEnv = {}, args = ["--only=staging"]) => new Promise<{code: number | null; output: string}>((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], { env: { ...env, ...extraEnv } });
      let output = "";
      child.stdout.on("data", chunk => output += chunk);
      child.stderr.on("data", chunk => output += chunk);
      child.on("error", reject);
      child.on("close", code => resolve({ code, output }));
    });
    const result = await run();
    assert.equal(result.code, 0, result.output);
    const request = JSON.parse(await readFile(capture, "utf8"));
    assert.deepEqual(request.args, ["exec", "cf", "workers", "secrets", "update", "UTELS_INGEST_TOKEN", "--worker", "test-worker-staging", "--body", "@/dev/stdin"]);
    assert.deepEqual(JSON.parse(request.input), { name: "UTELS_INGEST_TOKEN", text: ingestToken, type: "secret_text" });
    assert(!result.output.includes(ingestToken));
    assert(!request.args.join(" ").includes(ingestToken));
    const production = await run({ APP_WORKER_PROD: "test-worker-production" }, ["--only=production"]);
    assert.equal(production.code, 0, production.output);
    const prodRequest = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(prodRequest.args[prodRequest.args.indexOf("--worker") + 1], "test-worker-production");
    assert(!production.output.includes(ingestToken));
    const failure = await run({ CF_TEST_EXIT: "1" });
    assert.equal(failure.code, 1);
    assert(!failure.output.includes(ingestToken));
    const invalid = await run({}, ["--only=invalid"]);
    assert.equal(invalid.code, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
