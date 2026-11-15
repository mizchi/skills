///|
test "node:path basename via #module" {
  inspect(@js_binding_proj.basename("/foo/bar/baz.html"), content="baz.html")
}

///|
test "node:path extname via #module" {
  inspect(@js_binding_proj.extname("/foo/bar/baz.html"), content=".html")
}
