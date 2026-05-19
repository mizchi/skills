#!/usr/bin/env node
// One-shot helper for registering <your-app>'s two utels projects
// (production + staging) and writing the returned ingest tokens to
// wrangler secrets. Intended to be re-run idempotently; if a project
// is already registered, the script falls back to a no-op for that
// environment and the operator must inject the existing token via
// `wrangler secret put` manually.
//
// Required env (typically provided by `pnpm dotenvx run --quiet -f
// <utels>/.env --`):
//   UTELS_BOOTSTRAP_TOKEN  — utels bootstrap token (header value)
//
// Optional env:
//   UTELS_ENDPOINT         — defaults to https://utels.dev
//   APP_SERVER_DIR       — defaults to repo root <your-app>
//   APP_UTELS_PROJECT_PROD     — defaults to "<your-app>"
//   APP_UTELS_PROJECT_STAGING  — defaults to "<your-app>-staging"
//   DRY_RUN                — "1" to skip mutations
//
// The script intentionally never prints tokens to stdout/stderr; the
// ingest token is fed to `wrangler secret put` via stdin and then
// dropped from memory.

import { spawn } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = process.env.APP_SERVER_DIR
  ? resolvePath(process.env.APP_SERVER_DIR)
  : resolvePath(here, "..");

const dry = process.env.DRY_RUN === "1";
const bootstrapToken = process.env.UTELS_BOOTSTRAP_TOKEN;
if (!bootstrapToken) {
  console.error(
    "setup-utels: UTELS_BOOTSTRAP_TOKEN is required (run under " +
      "`dotenvx run -f <utels>/.env --`).",
  );
  process.exit(2);
}

const endpoint = (process.env.UTELS_ENDPOINT ?? "https://utels.dev").replace(/\/$/, "");
const prodProject = process.env.APP_UTELS_PROJECT_PROD ?? "<your-app>-prod";
const stagingProject =
  process.env.APP_UTELS_PROJECT_STAGING ?? "<your-app>-staging";

// utels validates origins (1..20 entries) even for server-side
// projects — the browser publicKey path still gets provisioned. Pass
// the worker host; we don't use the browser SDK from <your-app>, but
// having the origin in the allowlist keeps the registration call valid
// and lets future browser-side experiments piggyback.
const targets = [
  {
    env: "production",
    projectId: prodProject,
    displayName: "<your-app> (production)",
    origins: ["https://REPLACE_ME.workers.dev"],
    wranglerArgs: [],
  },
  {
    env: "staging",
    projectId: stagingProject,
    displayName: "<your-app> (staging)",
    origins: ["https://REPLACE_ME-staging.workers.dev"],
    wranglerArgs: ["--env", "staging"],
  },
];

const onlyEnv = (() => {
  const flag = process.argv.find((a) => a.startsWith("--only="));
  if (flag) return flag.slice("--only=".length);
  return process.env.APP_UTELS_ONLY || null;
})();

let exitCode = 0;
for (const target of targets) {
  if (onlyEnv && target.env !== onlyEnv) {
    console.log(`setup-utels: skipping ${target.env} (--only=${onlyEnv})`);
    continue;
  }
  console.log(`setup-utels: registering ${target.projectId} (${target.env}) …`);
  if (dry) {
    console.log(`  (DRY_RUN) would POST /api/registration and wrangler secret put`);
    continue;
  }

  let token;
  try {
    token = await registerProject(target);
  } catch (error) {
    exitCode = 1;
    console.error(`  registration failed: ${error.message ?? error}`);
    continue;
  }
  if (!token) {
    exitCode = 1;
    console.error("  no ingest token in response");
    continue;
  }

  try {
    await wranglerSecretPut("UTELS_INGEST_TOKEN", token, target.wranglerArgs);
    console.log(`  wrangler secret put UTELS_INGEST_TOKEN — OK`);
  } catch (error) {
    exitCode = 1;
    console.error(`  wrangler secret put failed: ${error.message ?? error}`);
  } finally {
    token = null;
  }
}

process.exit(exitCode);

async function registerProject(target) {
  const url = new URL("/api/registration", endpoint);
  url.searchParams.set("v", "1");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-utels-bootstrap-token": bootstrapToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      v: 1,
      projectId: target.projectId,
      displayName: target.displayName,
      plan: "free",
      origins: target.origins,
      createUploadToken: false,
      createIngestToken: true,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("response is not JSON");
  }
  return body?.tokens?.ingest?.token;
}

function wranglerSecretPut(name, value, extraArgs) {
  return new Promise((resolveP, rejectP) => {
    const args = ["exec", "wrangler", "secret", "put", name, ...extraArgs];
    const child = spawn("pnpm", args, {
      cwd: serverDir,
      stdio: ["pipe", "inherit", "inherit"],
      env: process.env,
    });
    child.on("error", rejectP);
    child.on("close", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`wrangler exited with code ${code}`));
    });
    child.stdin.write(`${value}\n`);
    child.stdin.end();
  });
}
