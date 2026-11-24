load("@aspect_rules_ts//ts:defs.bzl", "ts_config")
load("@npm//:defs.bzl", "npm_link_all_packages")

npm_link_all_packages(name = "node_modules")

ts_config(
    name = "tsconfig",
    src = "tsconfig.json",
    visibility = ["//visibility:public"],
)
