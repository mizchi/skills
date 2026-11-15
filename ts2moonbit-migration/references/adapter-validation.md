# Current adapter validation

Checked 2026-11-16 with moon 0.1.20261104, compiler v0.10.20+65efd5b93,
Node 24.22.2, mizchi/js_core 0.13.0, mizchi/x 0.7.0 and external async 0.22.7.
All dependency versions are explicit in the [smoke module](../assets/adapter-smoke/moon.mod).

A control using the old `mizchi/js/core` package failed resolution against
`mizchi/js@0.13.0`. Changing the package to `mizchi/js_core` also requires a
direct module import; its presence as a facade's transitive dependency is not
enough. The corrected boundary compiles and runs.

From the skills repository root:

```sh
moon -C ts2moonbit-migration/assets/adapter-smoke check --target js --deny-warn
moon -C ts2moonbit-migration/assets/adapter-smoke test --target js --deny-warn
moon -C ts2moonbit-migration/assets/adapter-smoke test --target native --package example/adapter_smoke/cross --deny-warn
moon -C ts2moonbit-migration/assets/adapter-smoke build --target js --release --deny-warn
node --test ts2moonbit-migration/assets/adapter-smoke/smoke.test.mjs
```

The Node consumer checks an `Any` property roundtrip, a genuine JS Promise and
its awaited results. The cross-target test creates a temporary directory,
writes/reads/removes a file and captures a Node child's stdout on JS and Native.
It also checks the experimental core async scheduler used by x 0.7.0.
The Promise boundary uses js_core's external async dependency separately;
sharing scheduler state between those runtime families was not tested.

The whole Web/Node/browser/npm binding catalog and the historical shape adapter
were not exhaustively rerun. Inspect the resolved interfaces and preserve the
consumer's own behavioral and `.d.ts` contracts before migrating those surfaces.
