# Binding configuration with cf

Declare bindings under `worker.env` in `cloudflare.config.ts`, using builders from `cf/config`. Read [configuration.md](../cf/configuration.md) for a mode-aware example and typegen setup.

| Runtime binding | cf builder |
| --- | --- |
| String / structured configuration | `bindings.text(value)` / `bindings.json(value)` |
| Required Worker secret | `bindings.secret()` |
| KV | `bindings.kv({ id })` |
| D1 | `bindings.d1({ id })` |
| R2 | `bindings.r2({ name })` |
| Durable Object | `bindings.durableObject({ worker, exportName })` plus `exports.durableObject(...)` for a local class |
| Queue producer | `bindings.queue({ name })` |
| Service/RPC | `bindings.worker({ worker })` |
| Assets | `bindings.assets()`; let Vite/framework produce the asset Build Output |

Inspect the installed builder types and [configuration explorer](https://developers.cloudflare.com/cf/projects/config-explorer/) for advanced resources, remote development settings, exports and triggers. Binding fields are camelCase; old `kv_namespaces`, `d1_databases` or `durable_objects.bindings` JSON arrays are migration inputs, not cf configuration.

Run `pnpm exec cf workers types --mode staging` after changing a mode's bindings. Include `.cloudflare/types` in TypeScript. Supply required secrets in `.dev.vars` locally or via deploy `--secrets-file`. Use resource IDs returned by cf API commands; credentials for those commands do not become Worker env bindings.
