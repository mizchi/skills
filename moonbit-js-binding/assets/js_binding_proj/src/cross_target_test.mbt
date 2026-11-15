///|
test "backend_name reports js on preferred-target" {
  inspect(@js_binding_proj.backend_name(), content="js")
}

///|
test "now_ms returns a positive timestamp" {
  assert_true(@js_binding_proj.now_ms() > 0.0)
}
