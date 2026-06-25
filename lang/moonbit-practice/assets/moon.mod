// moon.mod — module configuration (new DSL, replaces the deprecated moon.mod.json)
//
// The DSL allows comments and trailing commas. Top-level settings use `key = value`;
// build-affecting settings go inside the `options( ... )` block.
// Convert an existing moon.mod.json by running `moon fmt` in the module root.

name = "username/project"

version = "0.1.0"

license = "MIT"

repository = "https://github.com/username/project"

description = "One-line description of the module"

keywords = [ "cli", "example" ]

readme = "README.md"

// Default backend when none is passed on the command line (js | wasm | wasm-gc | native)
preferred_target = "js"

// Tweak warnings/alerts by number or name (prefix - to silence, + to enable)
warnings = "-2"

// Registry dependencies — version pinned inline with `@`. Omit the block if none.
import {
  "moonbitlang/x@0.4.45",
  // "username/other@0.1.0",
}

options(
  source: "src",          // source directory holding the packages
  // exclude: [ "examples", "node_modules", "_build" ],  // paths kept out of the published package
)
