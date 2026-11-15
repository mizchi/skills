// Promise / async bridge.
//
// Two MoonBit intrinsics do all the work:
//   - `%async.suspend` : turn a resume/reject callback into a suspension point
//   - `%async.run`     : start an async computation from a sync context
//
// Pattern: wrap a JS Promise in `#external type Promise[T]`, then provide
// `wait()` which translates await → suspend + Promise.then/catch.

///|
#external
pub type Promise[T]

///|
pub fn[T] Promise::to_any(self : Promise[T]) -> JsValue = "%identity"

///|
/// %async.suspend: suspend until `ok` or `err` is called from JS.
pub async fn[T, E : Error] suspend(
  f : ((T) -> Unit, (E) -> Unit) -> Unit,
) -> T raise E = "%async.suspend"

///|
/// %async.run: bridge sync JS → async MoonBit.
pub fn run_async(f : async () -> Unit noraise) -> Unit = "%async.run"

///|
extern "js" fn ffi_sleep(ms : Int32) -> Promise[Unit] =
  #| (ms) => new Promise((resolve) => setTimeout(resolve, ms))

///|
/// `await promise` — the canonical bridge.
/// Internally: suspend, then resume_ok from Promise.then, resume_err from .catch.
pub async fn[T] Promise::wait(self : Promise[T]) -> T {
  suspend(fn(ok, err) {
    self
    .to_any()
    .call_method("then", [identity(fn(v : JsValue) -> Unit { ok(identity(v)) })])
    .call_method("catch", [
      identity(fn(e : JsValue) -> Unit { err(identity(e)) }),
    ])
    |> ignore
  })
}

///|
/// `await setTimeout(..., ms)` — convenience.
pub async fn sleep(ms : Int32) -> Unit {
  ffi_sleep(ms).wait()
}

///|
/// FFI: returns a Promise. Private — wrap in an `async fn` below.
extern "js" fn ffi_resolve_later(value : Int32, ms : Int32) -> Promise[Int32] =
  #| (value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

///|
/// Public async API. Callers never see the Promise; `wait()` is internal.
pub async fn resolve_later(value : Int32, ms : Int32) -> Int32 {
  ffi_resolve_later(value, ms).wait()
}

///|
extern "js" fn ffi_promise_all(
  ps : FixedArray[Promise[JsValue]],
) -> Promise[JsValue] =
  #| (ps) => Promise.all(ps)

///|
pub fn[T] Promise::all(ps : Array[Promise[T]]) -> Promise[FixedArray[T]] {
  let args = FixedArray::from_array(ps[:])
  ffi_promise_all(args |> identity) |> identity
}
