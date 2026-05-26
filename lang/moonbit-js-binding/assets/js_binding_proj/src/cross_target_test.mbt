///|
test "backend_name reports js on preferred-target" {
  inspect(backend_name(), content="js")
}

///|
test "now_ms returns a positive timestamp" {
  assert_true(now_ms() > 0.0)
}
