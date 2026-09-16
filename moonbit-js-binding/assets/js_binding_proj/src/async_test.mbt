///|
async test "sleep then continue" {
  sleep(5)
  inspect("awoke", content="awoke")
}

///|
async test "resolve_later returns the value" {
  let v = resolve_later(42, 1)
  inspect(v, content="42")
}
