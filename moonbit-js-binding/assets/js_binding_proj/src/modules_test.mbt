///|
test "node:path basename via #module" {
  inspect(basename("/foo/bar/baz.html"), content="baz.html")
}

///|
test "node:path extname via #module" {
  inspect(extname("/foo/bar/baz.html"), content=".html")
}
