# Promise Bridging

Bridging `js Promise` to MoonBit `async fn` using the two compiler intrinsics `%async.suspend` and `%async.run`.

## The Two Intrinsics

```moonbit nocheck
///| suspends until ok() or err() is called from JS-land
pub async fn[T, E : Error] suspend(
  f : ((T) -> Unit, (E) -> Unit) -> Unit,
) -> T raise E = "%async.suspend"

///| starts an async computation from a synchronous context
pub fn run_async(f : async () -> Unit noraise) -> Unit = "%async.run"
```

`%async.suspend` turns a callback-style API into an awaitable. Inside `suspend(fn (ok, err) => ...)`, you pass `ok` to Promise.then and `err` to Promise.catch. The MoonBit async machinery pauses execution until one fires.

`%async.run` runs an `async` block from a non-async context. You need it when you want to expose an async MoonBit function as a JS function returning a Promise.

## Canonical `Promise[T]` wrapper

```moonbit nocheck
///|
#external
pub type Promise[T]

///|
pub fn[T] Promise::to_any(self : Promise[T]) -> JsValue = "%identity"

///|
pub async fn[T] Promise::wait(self : Promise[T]) -> T {
  suspend(fn(ok, err) {
    self.to_any().call_method("then", [identity(fn(v : JsValue) { ok(identity(v)) })])
        .call_method("catch", [identity(fn(e : JsValue) { err(identity(e)) })])
    |> ignore
  })
}
```

## Pattern: Promise-returning FFI + `async fn` wrapper

Standard two-layer approach:

```moonbit nocheck
///|
extern "js" fn ffi_read_file(path : String) -> Promise[String] =
  #| (path) => fs.promises.readFile(path, 'utf-8')

///|
pub async fn read_file(path : String) -> String {
  ffi_read_file(path).wait()
}
```

Callers never see `.wait()`:

```moonbit nocheck
async test "read file" {
  let contents = read_file("./README.md")
  assert_true(contents.length() > 0)
}
```

## Going the other way: MoonBit `async fn` → JS Promise

When exporting an async function to JS consumers, wrap it with `run_async` so the JS caller gets a real `Promise` instead of a pending MoonBit continuation:

```moonbit nocheck
///|
pub fn[R] promisify0(f : async () -> R) -> () -> Promise[R] noraise {
  () => {
    let { promise, resolve, reject } = Promise::withResolvers()
    run_async(async fn() noraise {
      try f() |> resolve catch {
        e => reject(e)
      }
    })
    promise
  }
}
```

The arity-specific helpers (`promisify1`, `promisify2`, ...) follow the same shape — one per argument count.

## `Promise::new`, `Promise::resolve`, `Promise::reject`

Mirror the JS constructors:

```moonbit nocheck
///|
extern "js" fn ffi_new_promise(
  executor : ((JsValue) -> Unit, (JsValue) -> Unit) -> Unit,
) -> Promise[JsValue] =
  #| (executor) => new Promise(executor)

///|
pub fn[A] Promise::new(
  f : async ((A) -> Unit, (Error) -> Unit) -> Unit,
) -> Promise[A] {
  ffi_new_promise(fn(resolve, reject) {
    run_async(async fn() noraise {
      f(a => a |> identity |> resolve, e => e |> identity |> reject) catch {
        e => e |> identity |> reject
      }
    })
  })
  |> identity
}
```

## sleep / timers

```moonbit nocheck
///|
extern "js" fn ffi_sleep(ms : Int) -> Promise[Unit] =
  #| (ms) => new Promise((resolve) => setTimeout(resolve, ms))

///|
pub async fn sleep(ms : Int) -> Unit {
  ffi_sleep(ms).wait()
}
```

## Promise.all / race / any

All three share a uniform signature shape:

```moonbit nocheck
extern "js" fn ffi_promise_all(ps : Array[Promise[JsValue]]) -> Promise[JsValue] =
  #| (ps) => Promise.all(ps)

pub fn[T] Promise::all(ps : Array[Promise[T]]) -> Promise[Array[T]] {
  ffi_promise_all(ps |> identity) |> identity
}
```

## `async test` requirements

`async test` blocks require the `moonbitlang/async` package:

```
// moon.pkg
import {
  "moonbitlang/async",
} for "test"
```

Without this import: `Cannot use 'async test': package moonbitlang/async is not imported`.

## Pitfalls

1. **Calling `.wait()` in a sync context.** Only works inside `async fn` or `async test`. Non-async callers must handle the `Promise[T]` directly — usually by exporting a `promisifyN` wrapper.
2. **Missing `run_async`.** Exporting an `async fn` directly to JS yields a one-shot continuation, not a Promise. Wrap with `run_async(async fn() noraise { ... })` inside the FFI boundary.
3. **Re-entrant `suspend`.** Calling `ok` or `err` more than once from the executor produces undefined behaviour (same as JS Promises — the first call wins, but accessors may still race).
4. **Dropping the return value of `.then(...).catch(...)`.** The `|> ignore` at the end of the `suspend` body is intentional — the chained Promise has no further use; holding a reference prevents optimizer cleanup.
