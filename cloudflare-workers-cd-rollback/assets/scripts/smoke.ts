// Generic post-deploy smoke check. Runs a small set of HTTP probes
// against a base URL and exits non-zero if any check fails. Designed
// for CI use after `wrangler deploy` so a broken deploy never sits in
// production silently.
//
// Inputs (env vars):
//   SMOKE_BASE_URL          — base URL of the worker (required)
//   CF_ACCESS_CLIENT_ID     — optional, sent on every request if set
//   CF_ACCESS_CLIENT_SECRET — same
//
// Customize the CHECKS list with the routes you care about. Each
// check declares an expected set of status codes; a 4xx that's
// "expected" (e.g. anonymous request gets 401) is a pass.

const base = process.env.SMOKE_BASE_URL;
if (!base) {
  console.error("SMOKE_BASE_URL is required");
  process.exit(2);
}

const accessHeaders = {};
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
  accessHeaders["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
  accessHeaders["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
}

const CHECKS = [
  {
    name: "root returns 2xx",
    path: "/",
    expectStatus: [200, 204],
  },
  {
    name: "health returns 200",
    path: "/health",
    expectStatus: [200],
  },
];

let failures = 0;
for (const check of CHECKS) {
  const url = new URL(check.path, base).toString();
  let status = 0;
  let body = "";
  try {
    const res = await fetch(url, { headers: accessHeaders });
    status = res.status;
    body = (await res.text()).slice(0, 200);
  } catch (error) {
    console.error(`✗ ${check.name}: fetch threw: ${error.message ?? error}`);
    failures += 1;
    continue;
  }
  const expected = check.expectStatus ?? [200];
  const ok = expected.includes(status);
  console.log(
    `${ok ? "✓" : "✗"} ${check.name}: ${url} → ${status}${ok ? "" : ` (expected ${expected.join("/")})`}`,
  );
  if (!ok) {
    console.error(`  body: ${body}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`smoke: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
