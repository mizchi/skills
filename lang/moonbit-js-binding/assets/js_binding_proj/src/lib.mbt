// Public API layer. Safe MoonBit wrappers over the raw FFI.

///|
/// Plain MoonBit function — exported to JS via moon.pkg `exports`.
pub fn add(a : Int, b : Int) -> Int {
  a + b
}

///|
/// Crosses the FFI boundary: String -> JS string -> String.
pub fn greet(name : String) -> String {
  "Hello, \{name}!"
}

///|
/// Wraps a JS value so Option matching works on the MoonBit side.
/// Returns None if the JS value is `undefined`.
pub fn[T] js_get_opt(obj : JsValue, key : String) -> T? {
  let v = obj.get(key)
  if is_undefined(v) {
    None
  } else {
    Some(identity(v))
  }
}
