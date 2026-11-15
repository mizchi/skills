// Module configuration in the moon.mod DSL.
// JSON manifests were removed in v0.10.19; `moon fmt` still migrates old projects.
name = "example/js_binding_proj"

version = "0.1.0"

description = "Minimal MoonBit JS FFI example for the moonbit-js-binding skill"

// Source directory holding the packages (top-level, not inside options)

source = "src"

// Default backend when none is passed on the command line

preferred_target = "js"

import {
  "moonbitlang/async@0.22.7",
}
