# Cleanup, cancellation, and external async migration

Use this reference for resource ownership or an external `moonbitlang/async`
upgrade. It combines the August cleanup guidance with the cancellation change
that shipped in September; the November `core/async` API remains experimental.
See [updates.md](updates.md) for the three release sources and precedence policy.

## Resource ownership

- Use `defer` for a resource owned by the current scope. Use `errdefer` when
  success transfers ownership to the caller and only failure needs cleanup.
- `errdefer` runs on an error or cancellation, not a successful return, break,
  or continue. A defer declared inside a loop iteration does not cover resources
  accumulated by earlier iterations; protect the accumulated collection outside
  the loop and each not-yet-transferred resource inside its iteration.
- Cleanup can raise or call async operations. A cleanup error replaces the
  pending error; other scheduled cleanups still run. Review `fragile_catch_all`
  warnings by moving cleanup to the appropriate defer, not by swallowing errors.

The synchronous cases in [semantics_wbtest.mbt](../assets/update-smoke/semantics_wbtest.mbt)
test successful ownership transfer, failed acquisition, cleanup ordering and
error replacement across Wasm, JS and Native.

## Cancellation from external async 0.22.0 onward

The [0.22.0 migration guide](https://github.com/moonbitlang/async/releases/tag/v0.22.0)
supersedes the earlier explanation that cancellation is an ordinary suberror.

`catch` cannot capture the cancellation primitive. It still propagates and runs
`defer` / `errdefer`. Remove branches using the deprecated
`@async.is_cancellation_error`, which now always returns false. For deliberate
cancellation handling use `@async.handle_cancellation`; it returns `None` on
cancellation and **does not clear the task's cancelled state**. Subsequent
cancellable operations can immediately cancel again.

`noraise` describes ordinary errors, not cancellation. Async functions are
cancellable unless marked `nocancel`. `@async.protect_from_cancel` is non-cancellable;
use it for cleanup that must complete. `TaskGroup::add_defer` callbacks must be
`nocancel`. Replace deprecated `with_cancellation_handler` with
`handle_cancellation` and re-check callback types against the resolved version.

The [pinned 0.22.7 interface](https://raw.githubusercontent.com/moonbitlang/async/v0.22.7/src/pkg.generated.mbti)
and the JS sample's [cancellation test](../../moonbit-js-binding/assets/js_binding_proj/src/async_test.mbt)
show these contracts. That test checks that ordinary `catch` is bypassed,
`errdefer` executes, the task stays cancelled, and protected async work completes.
Run it with `just --justfile moonbit.justfile test-js` from this repository.

## I/O migration when upgrading the external runtime

The August article describes async 0.21.0 changes; retain these when upgrading
through 0.22.x unless the resolved library's newer API says otherwise:

- Annotate HTTP headers as `@http.Headers`, which uses case-insensitive keys,
  rather than `Map[String, String]`.
- Replace removed file `create` / `truncate` arguments with `create_mode` and
  `permission`. `write_file` and `redirect_to_file` default to `CreateOrTruncate`;
  `open` keeps `OpenExisting`. Check this before touching an existing file.
- `protect_from_cancel` adopted `resume_on_cancel=true`; do not reintroduce the
  deprecated false behavior when porting an older cleanup example.
- Configure detected deadlocks through `set_deadlock_handler` when appropriate.
  External event-loop integration has its own API contract; it does not mean
  MoonBit application code runs on multiple threads.
- `process.pipe` composes child processes. A shared redirection pipe needs
  explicit closing after spawning its consumers; non-shared pipes retain their
  automatic ownership behavior. Signal termination and async-main cancellation
  have process-status semantics, not a generic positive exit-code mapping.

September adds `@async.platform` for runtime OS detection, including a portable
Wasm binary; `reuse_port_lb` has an effect only on Linux. `fs.remove` / `rmdir`
are non-cancellable cleanup operations. Inspect the current package signatures
before changing native, Wasm, or Worker adapters.

## Experimental core async

Do not infer an automatic runtime migration from the November announcement.
Core async requires an explicit experimental-package opt-in; incremental
coexistence requires external async 0.22.7 or newer. This is distinct from
upgrading an external-only sample to test its current cancellation contract.
