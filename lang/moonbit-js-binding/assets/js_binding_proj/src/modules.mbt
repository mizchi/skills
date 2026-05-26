// #module("...") imports a named export from a JS module, instead of inlining
// a closure. Generates `import { name } from "pkg"` (ESM) or
// `require("pkg").name` (CJS) at compile time.
//
// Prefer this over `require("...").get("name")` when:
//   - The name is known at compile time
//   - Bundlers need a statically analyzable import
//   - You want the same source to work under both ESM and CJS output

///|
/// Imports `path.basename` from Node's built-in `node:path` module.
#module("node:path")
extern "js" fn path_basename(p : String) -> String = "basename"

///|
/// Imports `path.extname`.
#module("node:path")
extern "js" fn path_extname(p : String) -> String = "extname"

///|
pub fn basename(p : String) -> String {
  path_basename(p)
}

///|
pub fn extname(p : String) -> String {
  path_extname(p)
}
