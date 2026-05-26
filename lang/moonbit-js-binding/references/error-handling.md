# Error Handling Across the JS Boundary

JavaScript uses `throw` / `try`/`catch`; MoonBit uses checked errors (`raise`, `try`/`catch`, `Result[T, E]`). Bridging the two requires an explicit wrapper.

## Catching JS Exceptions from MoonBit

Wrap the JS call in a `try/catch` on the JS side and surface success/failure via callbacks:

```moonbit nocheck
///|
pub suberror JsError {
  JsError(JsValue)
}

///|
extern "js" fn ffi_try_sync(
  op : () -> JsValue,
  on_ok : (JsValue) -> Unit,
  on_err : (JsValue) -> Unit,
) -> Unit =
  #| (op, on_ok, on_err) => {
  #|   try { on_ok(op()); }
  #|   catch (e) { on_err(e); }
  #| }

///|
pub fn try_sync(op : () -> JsValue) -> JsValue raise JsError {
  let mut result : Result[JsValue, JsError] = Ok(identity(undefined()))
  ffi_try_sync(
    op,
    fn(v) { result = Ok(v) },
    fn(e) { result = Err(JsError(e)) },
  )
  match result {
    Ok(v) => v
    Err(e) => raise e
  }
}
```

Usage:

```moonbit nocheck
test "catches JS throw" {
  let r : Result[JsValue, JsError] = try? try_sync(fn() {
    global_this().call_method("eval", [identity("throw new Error('boom')")])
  })
  guard r is Err(_) else { fail("expected error") }
}
```

## Raising into JS

Going the other way — export a MoonBit function that throws a JS `Error` on failure:

```moonbit nocheck
///|
extern "js" fn js_throw(value : JsValue) -> Unit =
  #| (value) => { throw value }

///|
pub fn export_sync(op : () -> Int raise) -> Int {
  try op() catch {
    e => {
      js_throw(identity(e.to_string()))
      panic()  // unreachable
    }
  }
}
```

Then call `export_sync` from the exported MoonBit function — JS consumers see a regular thrown Error.

## Async Error Handling

When an `async fn` raises, `.wait()` re-throws the JS rejection as a MoonBit error. The Promise bridge in `promise-bridging.md` wires `.catch` to the error callback automatically:

```moonbit nocheck
suberror JsError {
  JsError(JsValue)
}

extern "js" fn ffi_fetch(url : String) -> Promise[String] =
  #| (url) => fetch(url).then(r => r.text())

pub async fn fetch_text(url : String) -> String raise JsError {
  ffi_fetch(url).wait() catch {
    e => raise JsError(identity(e))
  }
}
```

Callers can use `try? fetch_text(url)` in an `async test` to get `Result[String, JsError]`.

## Pitfalls

1. **Letting JS throws escape an `extern "js"` function.** If the inline JS throws and you did not wrap it with `ffi_try_sync`, the uncaught exception propagates through MoonBit's runtime as a fatal abort rather than a catchable `raise`. Always wrap if the call can throw.

2. **Stringifying errors too eagerly.** JS errors often carry structured fields (`.code`, `.stack`, `.cause`). Store the raw `JsValue` and `.to_string()` only at display time.

3. **Using `panic()` as a "probably won't happen" fallback.** `panic` aborts the JS host. For recoverable paths, return `Result` or `raise`.

4. **Forgetting that `run_async(... noraise ...)` swallows errors silently.** The `noraise` constraint means the async block can't raise — any error must be caught inside. If you want the rejection to surface, the block needs to convert errors into a `reject(e)` call on the external resolver.
