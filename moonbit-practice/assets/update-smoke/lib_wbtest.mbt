///|
test "derive and JSON construction use the current core API" {
  let p = Point::{ x: 2, y: 3, }
  assert_true(p == Point::{ x: 2, y: 3, })
  inspect(@json.Json(p).stringify(), content="{\"x\":2,\"y\":3}")
  inspect(@json.ToJson::to_json(42).stringify(), content="42")
}

///|
test "byte regex captures raw request bytes" {
  let path = request_path(b"GET /raw\xff HTTP/1.1")
  assert_true(path is Some(b"/raw\xff"))
  assert_true(request_path(b"POST / HTTP/1.1") is None)
}

///|
test "slice clamps and total comparison defines NaN order" {
  let values = [1, 2, 3]
  assert_eq(values[1:99].length(), 2)
  assert_eq(Double::total_compare(0.0 / 0.0, -1.0), -1)
  assert_eq(Double::total_compare(-0.0, 0.0), 0)
}
