#!/usr/bin/env node
// One-shot helper for registering <your-app>'s two utels projects
// (production + staging) and writing the returned ingest tokens to
// cf Worker secrets. Existing project slugs can fail registration;
// use --only to retry a failed environment with a new project slug.
//
// Required env (typically provided by `pnpm dotenvx run --quiet -f
// <utels>/.env --`):
//   UTELS_BOOTSTRAP_TOKEN  — utels bootstrap token (header value)
//   APP_WORKER_PROD / APP_WORKER_STAGING — Worker name for each selected target
//
// Optional env:
//   UTELS_ENDPOINT         — defaults to https://utels.dev
//   APP_SERVER_DIR       — defaults to repo root <your-app>
//   APP_UTELS_PROJECT_PROD     — defaults to "<your-app>"
//   APP_UTELS_PROJECT_STAGING  — defaults to "<your-app>-staging"
//   DRY_RUN                — "1" to skip mutations
//
// The script intentionally never prints tokens to stdout/stderr; the
// ingest token is fed as a JSON body to `cf workers secrets update`
// through stdin on macOS/Linux and then dropped from memory.

import { spawn } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

type RegistrationTarget = {
  env: "production" | "staging";
  projectId: string;
  displayName: string;
  origins: string[];
  worker?: string;
};

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

const endpointFlag = process.argv.find(arg => arg.startsWith("--endpoint="));
const endpoint = (endpointFlag?.slice("--endpoint=".length) ?? process.env.UTELS_ENDPOINT ?? "https://utels.dev").replace(/\/$/, "");
const prodProject = process.env.APP_UTELS_PROJECT_PROD ?? "<your-app>-prod";
const stagingProject =
  process.env.APP_UTELS_PROJECT_STAGING ?? "<your-app>-staging";

// utels validates origins (1..20 entries) even for server-side
// projects — the browser publicKey path still gets provisioned. Pass
// the worker host; we don't use the browser SDK from <your-app>, but
// having the origin in the allowlist keeps the registration call valid
// and lets future browser-side experiments piggyback.
const targets: RegistrationTarget[] = [
  {
    env: "production",
    projectId: prodProject,
    displayName: "<your-app> (production)",
    origins: ["https://REPLACE_ME.workers.dev"],
    worker: process.env.APP_WORKER_PROD,
  },
  {
    env: "staging",
    projectId: stagingProject,
    displayName: "<your-app> (staging)",
    origins: ["https://REPLACE_ME-staging.workers.dev"],
    worker: process.env.APP_WORKER_STAGING,
  },
];

const onlyEnv = (() => {
  const flag = process.argv.find((a) => a.startsWith("--only="));
  if (flag) return flag.slice("--only=".length);
  return process.env.APP_UTELS_ONLY || null;
})();

if (onlyEnv && !targets.some(target => target.env === onlyEnv)) {
  console.error("setup-utels: --only must be production or staging");
  process.exit(2);
}
if (!dry && targets.some(target => (!onlyEnv || target.env === onlyEnv) && !target.worker)) {
  console.error("setup-utels: set APP_WORKER_PROD / APP_WORKER_STAGING for each selected target");
  process.exit(2);
}

let exitCode = 0;
for (const target of targets) {
  if (onlyEnv && target.env !== onlyEnv) {
    console.log(`setup-utels: skipping ${target.env} (--only=${onlyEnv})`);
    continue;
  }
  console.log(`setup-utels: registering ${target.projectId} (${target.env}) …`);
  if (dry) {
    console.log(`  (DRY_RUN) would POST /api/registration and cf workers secrets update for ${target.worker ?? target.env}`);
    continue;
  }

  let token;
  try {
    token = await registerProject(target, bootstrapToken);
  } catch (error) {
    exitCode = 1;
    console.error(`  registration failed: ${error instanceof Error ? error.message : "unknown error"}`);
    continue;
  }
  if (!token) {
    exitCode = 1;
    console.error("  no ingest token in response");
    continue;
  }

  try {
    await cfSecretUpdate("UTELS_INGEST_TOKEN", token, target.worker);
    console.log(`  cf workers secrets update UTELS_INGEST_TOKEN — OK`);
  } catch (error) {
    exitCode = 1;
    console.error(`  cf secret update failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    token = null;
  }
}

process.exit(exitCode);

async function registerProject(target: RegistrationTarget, registrationCredential: string): Promise<string | null> {
  const url = new URL("/api/registration", endpoint);
  url.searchParams.set("v", "1");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-utels-bootstrap-token": registrationCredential,
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
    throw new Error(`HTTP ${response.status}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("response is not JSON");
  }
  if (!body || typeof body !== "object" || !("tokens" in body)) return null;
  const tokens = body.tokens;
  if (!tokens || typeof tokens !== "object" || !("ingest" in tokens)) return null;
  const ingest = tokens.ingest;
  if (!ingest || typeof ingest !== "object" || !("token" in ingest)) return null;
  return typeof ingest.token === "string" && ingest.token ? ingest.token : null;
}

function cfSecretUpdate(name: string, value: string, worker: string | undefined): Promise<void> {
  if (!worker) return Promise.reject(new Error("Worker name is required"));
  return new Promise<void>((resolveP, rejectP) => {
    const args = ["exec", "cf", "workers", "secrets", "update", name,
      "--worker", worker, "--body", "@/dev/stdin"];
    const child = spawn("pnpm", args, {
      cwd: serverDir,
      // cf output may include API bodies on errors; keep tokens out of logs.
      stdio: ["pipe", "ignore", "ignore"],
      env: process.env,
    });
    child.on("error", rejectP);
    child.on("close", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`cf exited with code ${code}`));
    });
    child.stdin.on("error", rejectP);
    child.stdin.end(JSON.stringify({ name, text: value, type: "secret_text" }));
  });
}
