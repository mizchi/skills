---
name: cloudflare-mbt-worker-bundle
description: Bundle a Cloudflare Worker combining MoonBit core code with a TypeScript entry through cf and the Cloudflare Vite plugin, with required FFI rewrites and a post-build bundle check.
---

# Cloudflare Workers + MoonBit bundle pipeline

Use `cf`, `cloudflare.config.ts` and the Cloudflare Vite plugin to bundle MoonBit's JS output with the TypeScript Worker entry. See [mizchi/cf-example](https://github.com/mizchi/cf-example) (`~/ghq/github.com/mizchi/cf-example`) for the current cf/Vite setup; its checked versions are cf beta.5 and the Vite plugin beta on Node.js 24.

## Pipeline

```text
moon build --target js --release
  → prepare-worker (FFI rewrites into src/_generated/<PKG>-core.js)
  → cf build --mode <mode>
  → check emitted bundle
  → cf deploy --prebuilt --mode <same-mode> --dry-run
  → cf deploy --prebuilt --mode <same-mode>
```

Preparation must run before every build that will ship MoonBit changes. For local development, prepare the generated JS first, run `pnpm exec cf dev`, and regenerate it when MoonBit sources change; Vite does not invoke `moon build` automatically.

MoonBit emits plain ESM JS. The TypeScript entry side-effect imports the **prepared** file, which registers `globalThis.__appServerFetch`. Importing the original `_build/` file bypasses the rewrites and can produce a Worker that hangs.

Two source rewrites are required for the runtime versions this template targets:

- Replace `moonbitlang$async$internal$event_loop$$reschedule()` with the generated recursive reschedule symbol so awaited work resumes.
- Replace module-scope random seed initialization with a deterministic constant; Workers disallow random I/O at module initialization.

`requiredReplace` must fail when the expected source is absent. After a MoonBit/runtime upgrade, inspect generated code and update the rewrite deliberately rather than silently skipping it. Details: [moonbit-ffi-rewrites.md](references/moonbit-ffi-rewrites.md).

## Assets

- [worker.ts.template](assets/templates/worker.ts.template): TypeScript entry importing `./_generated/<PKG>-core.js` and telemetry wrappers. Copy to `src/worker.ts`; replace `<PKG>` and handler registration names as needed.
- [prepare-worker.ts.template](assets/scripts/prepare-worker.ts.template): copy to `scripts/prepare-worker.ts`, replace `<PKG>`, apply both FFI rewrites, write prepared JS into `src/_generated/`.
- [cloudflare.config.ts.template](assets/templates/cloudflare.config.ts.template): copy to `cloudflare.config.ts`. Modes choose production/staging Worker names, D1 IDs and R2 names. Replace IDs after provisioning; apply D1 migrations with `cf d1 migrations apply DATABASE_ID --dir db/migrations`.
- [vite.config.ts.template](assets/templates/vite.config.ts.template): Vite integration used by `cf dev`/`cf build`.
- [check-worker-bundle.ts](assets/scripts/check-worker-bundle.ts): checks an emitted JS bundle for corrupt control bytes, stub output and project-specific markers. Inspect `worker.config.json`'s manifest for the main module and pass its path under `.cloudflare/output/v0/workers/<worker>/bundle/`. If Vite splits modules, check the bundle directory so markers in other modules are included.

Add `cf`, `@cloudflare/vite-plugin@beta`, Vite and TypeScript with pnpm, commit the lockfile, generate types with `pnpm exec cf workers types`, and include `.cloudflare/types` in TypeScript. Use the build mode again for prebuilt deploy. For required secret bindings, pass an ignored `--secrets-file` to validation and deployment.

When migrating an existing Worker, run `cf migrate --dry-run` then `cf migrate` before using project commands. Keep prior DO lifecycle history and resource IDs; do not bootstrap a replacement config that loses existing bindings. See the [cf configuration guide](../cloudflare-deploy/references/cf/configuration.md).

## References

- [cf-traps.md](references/cf-traps.md): modes, build artifacts, resource IDs and unsupported beta operations.
- [moonbit-ffi-rewrites.md](references/moonbit-ffi-rewrites.md): runtime rewrite targets and symptoms.
- [cf-example](https://github.com/mizchi/cf-example): cf/Vite/types/Playwright example.
- [cloudflare-starterkit-mbt](https://github.com/mizchi/cloudflare-starterkit-mbt) and [mnemo](https://github.com/mizchi/mnemo): MoonBit handler/runtime examples; translate their older CLI setup to cf.
