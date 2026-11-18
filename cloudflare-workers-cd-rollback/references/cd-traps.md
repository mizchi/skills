# cf CD traps

1. **Preserve traffic state as JSON.** `cf workers deployments list` returns latest active deployment first. Save its complete versions array; do not parse old human-readable lines with awk or take the last entry.
2. **Separate stderr from JSON.** `2>&1` mixes progress into stdout and breaks parsers. Reject malformed state before publishing.
3. **Recognize only a genuine first deployment.** Empty listings or missing-Worker code 10007 can skip rollback. Auth, permission and network errors must fail the job.
4. **Use the correct mode and IDs.** Build with `--mode staging`, deploy that artifact with the same mode. `cf d1 migrations apply` accepts the database ID and `--dir`; do not pass old `--remote`/`--env`/`--yes` flags.
5. **Deploy the checked artifact.** RC `cf deploy --prebuilt` consumes `.cloudflare/output/v1/` without another build. Rebuild beta artifacts and update CI upload/download paths. MoonBit preparation and bundle checks must finish before this step.
6. **Rollback affects Worker traffic, not storage.** Use expand/contract D1 migrations and preserve previous schema compatibility. Secret changes can block restoring an old version; surface the failure instead of forcing it.
7. **First branch pushes may have no path diff.** Use workflow_dispatch for initial bring-up. Keep filters aligned with `cloudflare.config.ts`, `vite.config.ts` and generated-source inputs.
8. **Keep shell source separate from inputs.** Pass messages through `env`; avoid direct interpolation of commit messages and arbitrary workflow inputs into `run` scripts.
9. **Secrets have separate roles.** CI supplies Cloudflare CLI credentials through environment variables. An existing or explicitly selected dotenvx setup can decrypt those values, but is not required. Worker secrets use bindings and deploy `--secrets-file`. A PR dry run uses dummy Worker secret values and requires no Cloudflare API credentials. Check required keys separately; RC.1 dry-run does not reliably reject missing secret values.
10. **Live logs use observability tail.** `cf observability tail --worker <name>` streams newline-delimited JSON when Workers Logs is enabled. Deployment lists describe traffic/version history, not request logs.
11. **Remote conflicts require an explicit decision.** `cf deploy --force` overrides a remote/API deployment or conflicting configuration. Keep it out of routine CD and investigate the conflict. `--no-provision` can fail missing binding IDs instead of creating resources.

Reference: [cf CI docs](https://developers.cloudflare.com/cf/ci/), [cf-example](https://github.com/mizchi/cf-example), [configuration guide](../../cloudflare-deploy/references/cf/configuration.md).
