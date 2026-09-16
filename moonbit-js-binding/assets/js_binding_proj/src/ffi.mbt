// JS FFI layer. Gated to the `js` backend via moon.pkg `targets`.
//
// Convention in this project:
//   - `ffi_*` bindings are private wrappers around raw JS
//   - Public wrappers are exposed from other files (lib.mbt, async.mbt)

///|
/// Opaque JS value. `#external` means "arbitrary JS `any`, do not introspect".
#external
pub type JsValue

///|
/// Zero-cost bitcast. Compiles to no JS. Use to move values across the
/// FFI boundary when we know the runtime representation matches.
pub fn[A, B] identity(a : A) -> B = "%identity"

// ============================================
// Inline JS: #| literal is the function body.
// ============================================

///|
pub extern "js" fn console_log(msg : String) -> Unit =
  #| (msg) => console.log(msg)

///|
pub extern "js" fn math_sqrt(x : Double) -> Double =
  #| (x) => Math.sqrt(x)

///|
/// Module-and-name form: imports `Math.max` directly (no closure wrapper).
pub extern "js" fn math_max(a : Double, b : Double) -> Double = "Math" "max"

// ============================================
// JsValue helpers (property get/set, method call, new).
// ============================================

///|
pub extern "js" fn JsValue::get(self : JsValue, key : String) -> JsValue =
  #| (obj, key) => obj[key]

///|
pub extern "js" fn JsValue::set(
  self : JsValue,
  key : String,
  value : JsValue,
) -> Unit =
  #| (obj, key, value) => { obj[key] = value }

///|
pub extern "js" fn JsValue::call_method(
  self : JsValue,
  name : String,
  args : Array[JsValue],
) -> JsValue =
  #| (obj, name, args) => obj[name](...args)

///|
pub extern "js" fn new_object() -> JsValue =
  #| () => ({})

///|
pub extern "js" fn global_this() -> JsValue =
  #| () => globalThis

///|
pub extern "js" fn undefined() -> JsValue =
  #| () => undefined

///|
pub extern "js" fn is_undefined(v : JsValue) -> Bool =
  #| (v) => v === undefined

///|
pub extern "js" fn typeof_(v : JsValue) -> String =
  #| (v) => typeof v

// ============================================
// JSON — round-trip test subject.
// ============================================

///|
pub extern "js" fn json_stringify(v : JsValue) -> String =
  #| (v) => JSON.stringify(v)

///|
pub extern "js" fn json_parse(s : String) -> JsValue =
  #| (s) => JSON.parse(s)
