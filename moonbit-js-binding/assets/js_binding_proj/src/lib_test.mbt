///|
test "pure moonbit add" {
  inspect(@js_binding_proj.add(2, 3), content="5")
}

///|
test "greet crosses FFI" {
  inspect(@js_binding_proj.greet("Moon"), content="Hello, Moon!")
}

///|
test "Math.sqrt via inline closure" {
  inspect(@js_binding_proj.math_sqrt(16.0), content="4")
}

///|
test "Math.max via module+name form" {
  inspect(@js_binding_proj.math_max(3.5, 7.25), content="7.25")
}

///|
test "typeof and undefined" {
  inspect(
    @js_binding_proj.typeof_(@js_binding_proj.undefined()),
    content="undefined",
  )
  assert_true(@js_binding_proj.is_undefined(@js_binding_proj.undefined()))
}

///|
test "json round-trip through JsValue" {
  let obj = @js_binding_proj.new_object()
  obj.set("name", @js_binding_proj.identity("moon"))
  obj.set("n", @js_binding_proj.identity(42))
  let js = @js_binding_proj.json_stringify(obj)
  inspect(
    js,
    content=(
      #|{"name":"moon","n":42}
    ),
  )
  let input =
    #|{"ok":true,"missing":null}
  let parsed = @js_binding_proj.json_parse(input)
  let ok : Bool = @js_binding_proj.identity(parsed.get("ok"))
  assert_true(ok)
  // Note: `null` is NOT `undefined` — js_get_opt treats them differently.
  let maybe : Int32? = @js_binding_proj.js_get_opt(parsed, "absent")
  debug_inspect(maybe, content="None")
}

///|
test "method arguments use native JS arrays at the boundary" {
  let args : FixedArray[@js_binding_proj.JsValue] = [
    @js_binding_proj.identity("first"),
    @js_binding_proj.identity("second"),
  ]
  let array = @js_binding_proj.json_parse("[]")
  array.call_method("push", args) |> ignore
  inspect(
    @js_binding_proj.json_stringify(array),
    content="[\"first\",\"second\"]",
  )
  let empty : FixedArray[@js_binding_proj.JsValue] = []
  array.call_method("push", empty) |> ignore
  inspect(
    @js_binding_proj.json_stringify(array),
    content="[\"first\",\"second\"]",
  )
}
