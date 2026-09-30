# cf + MoonBit deployment traps

- Prepare MoonBit JS before Vite builds, and import `src/_generated/<PKG>-core.js`. Importing `_build/` directly skips the required runtime fixes.
- `cf build` emits Build Output in `.cloudflare/output/v0/`. Inspect the Worker manifest for the emitted main module; Vite may emit multiple modules. Check all emitted JS when looking for runtime markers.
- `cf deploy` normally builds again. To deploy the artifact you checked, pass `--prebuilt` and the same `--mode` as the build.
- D1 API/migration commands take database IDs. Use `cf d1 query DATABASE_ID --sql "SELECT ..."` to investigate schema/constraint failures; `--remote`, database names and `--yes` from old CLI examples are not interchangeable.
- cf deployment listings are JSON with the latest active deployment first. Preserve all version IDs and percentages when recording rollback state; do not reuse text/awk parsing from old Wrangler workflows.
- `1101 Worker threw exception` can involve a D1 constraint failure, a BigInt bind hang, or an awaited Promise that never resumes. Check emitted rewrite targets and direct D1 queries; use Workers Logs in the dashboard or telemetry to inspect requests.
- A path-filtered first push to a new branch can have no diff and skip CD. Manually trigger the initial deployment if needed.
- cf beta.5 has no live-log streaming. Do not invent `cf tail` or treat a deployment list as request logs.

Current command and configuration reference: [cf guide](../../cloudflare-deploy/references/cf/README.md). The [CD skill](../../cloudflare-workers-cd-rollback/SKILL.md) ships JSON-based traffic snapshots.
