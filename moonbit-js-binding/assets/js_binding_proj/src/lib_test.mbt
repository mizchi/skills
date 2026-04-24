///|
test "pure moonbit add" {
  inspect(add(2, 3), content="5")
}

///|
test "greet crosses FFI" {
  inspect(greet("Moon"), content="Hello, Moon!")
}

///|
test "Math.sqrt via inline closure" {
  inspect(math_sqrt(16.0), content="4")
}

///|
test "Math.max via module+name form" {
  inspect(math_max(3.5, 7.25), content="7.25")
}

///|
test "typeof and undefined" {
  inspect(typeof_(undefined()), content="undefined")
  assert_true(is_undefined(undefined()))
}

///|
test "json round-trip through JsValue" {
  let obj = new_object()
  obj.set("name", identity("moon"))
  obj.set("n", identity(42))
  let js = json_stringify(obj)
  inspect(js, content=(
    #|{"name":"moon","n":42}
  ))
  let input = (
    #|{"ok":true,"missing":null}
  )
  let parsed = json_parse(input)
  let ok : Bool = identity(parsed.get("ok"))
  assert_true(ok)
  // Note: `null` is NOT `undefined` — js_get_opt treats them differently.
  let maybe : Int? = js_get_opt(parsed, "absent")
  inspect(maybe, content="None")
}
