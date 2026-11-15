---
name: dep-lib-review
description: Periodic dependency review for Node.js/pnpm projects — outdated package triage, security audit, update batching strategy (patch/minor/major), validation checklist. Run monthly or before major releases. Use when asked to review or update dependencies in a repo.
---

# Dependency Review

## Trigger conditions

Run this review when:
- Monthly maintenance cadence
- Before a major release or branch freeze
- `pnpm audit` reports a vulnerability in CI
- A major ecosystem library (React, Vite, TypeScript, etc.) drops a new major version

## Step 1 — Gather current state

Run in parallel:

```bash
# Outdated packages (name, current, wanted, latest)
pnpm outdated 2>/dev/null || true

# Security vulnerabilities (runtime + dev); use this skill's absolute path
node <skill-dir>/scripts/audit-report.mjs --repo "$PWD"

# Check if Renovate / Dependabot is configured
ls .github/renovate.json renovate.json .github/dependabot.yml 2>/dev/null || echo "no bot configured"
```

If a bot (Renovate/Dependabot) is already configured, check its open PRs first — avoid duplicating work.

## Step 2 — Triage

### Security findings

Do not use CVSS score alone. Apply attack-vector weight:

| CVE type | devDep only | browser SPA | SSR / Edge |
|---|---|---|---|
| RCE | Review CI/build/dev-server reachability | Review affected execution path | **P0** if reachable |
| XSS via library | Review generated output/dev-server reachability | **P0** if reachable | **P0** if reachable |
| Prototype Pollution | Review build/input path | **P1** (check input path) | **P0** if reachable |
| ReDoS | Review CI/dev-server input path | **P1** (check user input reach) | **P0** if reachable |
| Supply chain (postinstall) | **P0** | **P0** | **P0** |
| Path Traversal / SSRF | Review CI/dev-server input and credentials | Review affected execution path | **P0** if reachable |

The checked pnpm 10.28.2 `pnpm audit --json` report stores advisories in
`advisories` and severity counts in `metadata.vulnerabilities`, rather than a
top-level npm-style `vulnerabilities` map. Check the actual installed version's
schema when upgrading.

The bundled [audit normalizer](scripts/audit-report.mjs) accepts pnpm's
`advisories` schema and npm-style `vulnerabilities`, requiring complete numeric
counts. It keeps findings from audit exit 1; unknown JSON, registry errors and
failed commands exit 3 rather than becoming an empty result. Use Node 24+.

```bash
node <skill-dir>/scripts/audit-report.mjs --repo "$PWD" --prod
# Or inspect an already captured report without requesting the registry again:
node <skill-dir>/scripts/audit-report.mjs --input audit.json
```

Exit 0 means a completed audit with zero reported vulnerabilities, 1 means
reported vulnerabilities, and 3 means the check could not complete. Inspect the
normalized `advisories` and `counts`; `--prod` is a runtime view, not permission
to ignore vulnerabilities in CI, build tools or development servers.

### Version updates — batch strategy

| Update type | Strategy |
|---|---|
| **Patch** (1.2.3 → 1.2.4) | Batch compatible updates; inspect release/security notes and validate. |
| **Minor** (1.2.x → 1.3.x) | Check changelog for deprecations. Batch non-breaking ones. |
| **Major** (1.x → 2.x) | One PR per package. Read migration guide. Never batch with other changes. |

Identify the category for each outdated package:

```bash
# Categorize outdated packages (deprecated / major / minor / patch)
pnpm outdated --json 2>/dev/null | jq -r '
  to_entries[] |
  (.value.current // "none") as $cur |
  (.value.latest // "none") as $lat |
  (.value.dependencyType // "dependencies") as $t |
  ($cur | split(".")[0]) as $curMaj |
  ($lat | split(".")[0]) as $latMaj |
  (if .value.isDeprecated then "deprecated"
   elif $curMaj != $latMaj then "major"
   elif ($cur | split(".")[1]) != ($lat | split(".")[1]) then "minor"
   else "patch" end) as $category |
  "\($category)\t\(.key)\t\($cur) → \($lat)\t\($t)"' | sort
```

### Trend watch (manual check)

Treat these as investigation candidates, not evidence of deprecation. Confirm upstream support, required behavior and migration cost before recommending a replacement:
- `jest` → migrate to vitest
- `axios` → migrate to `fetch` / `ky`
- `moment` → migrate to `Temporal` / `date-fns` / native `Date`
- `lodash` → replace with native `Array`/`Object` APIs
- `webpack` → migrate to Vite
- `mocha`/`chai` → migrate to vitest
- CJS-only packages in an ESM project (check `exports` field in their `package.json`)
- `@types/<pkg>` marked deprecated → the base package likely ships its own types now. Verify: `cat node_modules/<pkg>/package.json | jq '.types, .typings'`. If non-null, remove the `@types/<pkg>` devDep and typecheck the consumer before removing the redundant package.

## Step 3 — Execute updates

### Patch + safe minor batch

```bash
# Update all packages to their "wanted" semver range
pnpm update

# Validate
pnpm typecheck && pnpm test:ci && pnpm lint
```

If the project has E2E tests:
```bash
pnpm test:e2e
```

Commit as a single PR: `chore: update patch/minor dependencies`.

### Major version update (one package at a time)

```bash
# Update single package to latest
pnpm add <package>@latest

# For devDep
pnpm add -D <package>@latest
```

Then:
1. Read the official migration guide / CHANGELOG for breaking changes.
2. Check whether an official **codemod** exists (e.g. `@tailwindcss/upgrade`, React codemods). Run it first — it handles ~80-90% of mechanical changes automatically.
   - After a codemod, audit `package.json` for misplacements: some codemods add build-time packages to `dependencies` instead of `devDependencies`. Move them if needed.
   - Codemods may not fully migrate when complex plugins are involved. Check the output log for "could not be automatically migrated" warnings and handle manually.
3. Run `grep -r "deprecated API" src/` or use ast-grep for changed APIs.
4. Fix any breakage.
5. Validate: `pnpm typecheck && pnpm test:ci && pnpm lint`.
6. If VRT snapshots exist, regenerate in Linux container after UI-touching upgrades.
7. Commit as standalone PR: `chore: upgrade <package> to v<N>`.

### pnpm troubleshooting for major upgrades

If `pnpm install` fails after editing `package.json`:

| Error | Cause | Fix |
|---|---|---|
| `ERR_PNPM_MISSING_TIME` | Stale metadata in pnpm store | `pnpm store prune` then retry |
| `ERR_PNPM_NO_MATCHING_VERSION` for a package that exists on the registry | Stale lockfile entries conflict with new transitive deps | Check the configured registry, release version, overrides and package constraints; preserve the lockfile while diagnosing |

Commit intentional dependency and lockfile changes together after validation. Do not delete a lockfile as a routine metadata troubleshooting step.

## Step 4 — Validation checklist

Before marking the PR ready:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test:ci` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds (no bundle-size regression > 5%)
- [ ] E2E smoke test passes (if applicable)
- [ ] `pnpm audit` returns zero high/critical findings (or all remaining are triaged)

## Step 5 — Output

Write a brief summary with:

```
## Dependency review — <YYYY-MM-DD>

### Security
- [FIXED] <package>@<ver>: <CVE title> (was <severity>)
- [IGNORED] <package>: <reason> (devDep-only / browser-only / no user input path)

### Updated
- Patch batch: <N> packages → see commit <sha>
- Major: <package> v<old> → v<new> (standalone PR #<N>)

### Deferred
- <package> v<old> → v<new>: migration effort high, scheduled for <date>

### Trend watch
- <package>: migration recommended → <alternative>
```

## Anti-patterns

- Bundling major upgrades together — one regression makes the entire batch untestable
- Accepting `pnpm audit fix --force` blindly — it can jump major versions silently
- Ignoring CVEs without documenting the triage reason
- Updating `@types/*` packages separately from their runtime counterpart — always co-update

## Related

- `frontend-review-deps` — extended version with scripts for the frontend-review suite (CVE triage + trend-watch data files)
- `upstream-fix-and-pin` — when the fix needs to come from patching upstream
