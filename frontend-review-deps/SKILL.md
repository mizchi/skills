---
name: frontend-review-deps
description: Use when auditing dependency health — outdated packages, CVE triage with attack-vector weighting, deprecated/declining library detection (trend-watch). Runs `audit-deps.sh` and `audit-trend-watch.sh`. Pairs with `frontend-review-security` for the full security picture.
---

# Frontend Review — Dependencies

You are auditing the dependency health of a frontend project. This covers three areas:

1. **Freshness** — outdated packages and breaking update procedures
2. **CVE triage** — vulnerabilities weighted by actual attack vector, not just CVSS score
3. **Trend watch** — deprecated, abandoned, or superseded libraries that should be migrated

## Procedure

Collector reports use a versioned envelope: read values under `data`, inspect `status` and `issues`, and keep missing measurements distinct from zero. See the local collection contract.

1. In parallel, run:
   - `<skill-dir>/scripts/audit-deps.sh --repo <client-repo> --run-checks`
   - `scripts/audit-trend-watch.sh --repo <client-repo>`
2. Read `raw/deps.json` and `raw/trend-watch.json`.
3. For each CVE finding, apply the attack-vector triage matrix below before assigning priority.
4. For each trend-watch finding (Tier 1/2/3), confirm the installed version and assess migration cost.

## CVE Triage — Attack Vector Matrix

Do not use CVSS score alone. A devDependency can execute in CI, build pipelines or a development server; assess those paths even when it is absent from the final browser bundle.

| CVE Type | devDep only | Runtime (SPA) | Runtime (SSR/Edge) |
|---|---|---|---|
| RCE | Review CI/dev-server path | Review affected execution path | **P0** |
| Prototype Pollution | Review CI/dev-server path | **P1** (check input path) | **P0** |
| ReDoS | Review CI/dev-server path | **P1** (check user input reach) | **P0** |
| Path Traversal | Review CI/dev-server path | **ignore** | **P0** |
| XSS via library | Review CI/dev-server path | **P0** (HTML-generating libs) | **P0** |
| SSRF | Review CI/dev-server path | **ignore** | **P0** |
| Supply Chain (postinstall malware) | CI **P0** | CI **P0** | **P0** |

**Triage procedure:**

1. Run `pnpm audit --prod` to exclude devDeps from output.
2. Focus on Prototype Pollution / ReDoS / XSS — other types are low-risk for browser-only SPAs.
3. For each remaining finding, check whether user-controlled input can reach the vulnerable code path. If not, downgrade to P2.
4. For SSR / Edge Functions, treat RCE / Path Traversal / SSRF as P0.
5. Document every ignored CVE in `kpi/audit-triage.md` with the reason.

The checked pnpm 10.28.2 `pnpm audit --json` report stores advisories in
`advisories` and severity counts in `metadata.vulnerabilities`, rather than a
top-level npm-style `vulnerabilities` map. Check the actual installed version's
schema when upgrading.

Use `<skill-dir>/scripts/audit-report.mjs --repo <client-repo> --prod`
for a normalized runtime-only view. The parser validates pnpm's advisories schema
and npm-style vulnerability reports. Audit exit 1 preserves findings; unknown
schemas or transport errors do not become a clean result. Read `advisories` and
`counts`, and inspect development/CI exposure separately before dismissing a CVE.

## Trend Watch — Library Tiers

The bundled trend collector inventories declared packages. It leaves deprecation verdicts unassessed until current upstream notices and the installed version are checked. Suggested review priorities:

- **Tier 1 (address now)**: A confirmed security, support or compatibility problem affecting this project. Choose an upgrade, mitigation or replacement from the actual requirements; package names alone do not imply deprecation.
- **Tier 2 (plan migration)**: Maintenance mode / satisfaction declining / RSC-incompatible.
- **Tier 3 (watch)**: EOL versions exist / satisfaction trending down.

For each Tier 1 finding: propose a concrete migration path and estimate effort (hours/days).
For each Tier 2 finding: recommend scheduling a migration in the next 1–3 months.
For each Tier 3 finding: add to the ongoing monitoring list.

## Library Selection — Web Standards First

Before recommending a new dependency as a replacement, apply this order:

1. **Can a Web Platform / ECMAScript standard API cover this?**

| Use case | Avoid | Use instead |
|---|---|---|
| Date / time | moment, date-fns, dayjs | `Temporal` (polyfill), or `Date` for simple cases |
| Array / object utilities | lodash, ramda | `Array.prototype.{flatMap,findLast}`, `Object.{entries,fromEntries,groupBy}`, `structuredClone()` |
| HTTP requests | axios, request | `fetch` + `AbortController` |
| UUID generation | uuid, nanoid | `crypto.randomUUID()` |
| URL / query params | qs, query-string | `URL`, `URLSearchParams` |
| Number / date formatting | numeral.js | `Intl.NumberFormat`, `Intl.DateTimeFormat` |

2. **Tree-shakable?** Only what is imported should end up in the bundle.
3. **Supported for this use?** Check current upstream support, security response and compatibility; release age alone is not proof of abandonment.
4. **Bundle impact < 5 kb gzip?** Verify with `pnpm build` and a bundle analyser.

## Breaking Update Procedure

1. Propose as a **standalone PR** — never bundle with feature or refactor work.
2. Read the changelog for removed APIs; grep / ast-grep the codebase for usages.
3. Require `typecheck && lint && test:ci && e2e` to pass before merge.
4. If VRT snapshots exist, regenerate them in a Linux container after the upgrade.

## Output

Write `<client-repo>/.frontend-review/report/latest/md/deps-review.md` with:

- **Outdated packages** table (name, current, latest, breaking?)
- **CVE findings** after attack-vector triage (priority, package, type, reason for priority)
- **Trend watch** findings by tier (Tier 1: migration now, Tier 2: plan, Tier 3: monitor)
- **Ignored CVEs** with justification (for `kpi/audit-triage.md`)
- **Recommended PRs**: update batches + migration starting points

## Boundaries

- Do NOT assess TypeScript / lint / dead code — that's `frontend-review-hygiene`.
- Do NOT run the AI pentest or check HTML sinks — that's `frontend-review-security`.
- Do NOT touch source files in the client repo.

## Reference

Read the bundled [collection contract](references/collection-contract.md) for report schemas, standalone script paths, partial results and verification limits. The operational guidance above does not require an external checklist bundle.
