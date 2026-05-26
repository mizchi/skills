// Per-declaration backend gating with `#cfg(target="...")`.
//
// Use this pattern when most of a file is target-independent but a few
// declarations need a backend-specific implementation — avoids splitting
// a coherent module across two files.

///|
/// Returns the backend name at compile time. No runtime branch.
#cfg(target="js")
pub fn backend_name() -> String {
  "js"
}

///|
#cfg(target="wasm-gc")
pub fn backend_name() -> String {
  "wasm-gc"
}

///|
#cfg(target="native")
pub fn backend_name() -> String {
  "native"
}

///|
/// Epoch milliseconds from the host. JS uses `Date.now()`; other backends
/// would need their own implementation (omitted here).
#cfg(target="js")
extern "js" fn ffi_now_ms() -> Double =
  #| () => Date.now()

///|
#cfg(target="js")
pub fn now_ms() -> Double {
  ffi_now_ms()
}
