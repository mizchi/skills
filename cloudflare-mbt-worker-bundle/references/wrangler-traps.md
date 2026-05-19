# wrangler traps worth knowing

Collected from real debugging sessions in `mizchi/mnemo`. Most also live in `cloudflare-starterkit-mbt/docs/regression/worker-deploy.md`.

## 1. `wrangler deployments list` is OLDEST FIRST

v4 ordering prints chronological order: the most recent deploy is the **last** entry. Take it with:

```bash
awk '/^Version\(s\):/ { last = $NF } END { print last }'
```

Not `head -n1`. This bit a CD auto-rollback chain that captured the wrong "previous version" and rolled forward.

## 2. `wrangler d1 migrations apply --yes` does not exist

`--yes` is silently rejected as an unknown option, wrangler prints help and exits 1. In CI the prompt is auto-skipped without any flag. Just don't pass it.

## 3. `1101 Worker threw exception` is not always a runtime crash

Cloudflare returns 1101 whenever the worker's fetch handler throws OR hangs. The HTML body says "Worker threw exception" but the real cause may be:

- A unique-constraint violation in D1 (`INSERT` without `ON CONFLICT`) — the throw escapes the request handler because there's no try/catch around `runStatement`.
- A BigInt bind that hangs `.run()` past the request timeout (see `sqlc-gen-moonbit-safety` skill).
- A `Promise` returned from an extern JS function that was never awaited.

Always **query D1 directly** before believing the message. `wrangler d1 execute <name> --remote --command 'SELECT ...'` rules out half-writes faster than guessing.

## 4. wrangler `dev` rebuilds on every request in some configs

If you find yourself thinking "I changed X and dev didn't pick it up", check the wrangler.jsonc for `watch` settings. Default is fine for `src/`, but generated paths under `src/_generated/` may not be watched. Re-run `pnpm run build` if a generated file changed.

## 5. First push to a fresh branch may skip paths-filtered workflows

When you create a new `release` branch with the same tip as `main`, the path-filtered `on: push: paths: [...]` workflows can see "no diff" and skip. Trigger the first production deploy via `gh workflow run deploy --ref release -f environment=production` once; subsequent commits onto release trigger normally.

## 6. Path filter doesn't fire when the new branch has 0 diff vs base

Same root cause as 5. Either accept the manual trigger for the first deploy, or drop the path filter (every push becomes a deploy candidate — usually fine for a deploy.yml that does its own `wrangler dry-run` before actually deploying).

## 7. wrangler API token vs OAuth split

`wrangler tail` requires OAuth login. `CLOUDFLARE_API_TOKEN` is rejected for tail with `"Failed to fetch auth token: 400 Bad Request"`. Either unset the API token and `wrangler login`, or accept that you can't tail and use `wrangler deployments view <id>` for after-the-fact log inspection.

`wrangler deploy` is the opposite — it prefers the API token; OAuth still works but the API token is the documented CI path.
