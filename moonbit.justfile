set shell := ["bash", "-euo", "pipefail", "-c"]

smoke := "moonbit-practice/assets/update-smoke"
bindings := "moonbit-js-binding/assets/js_binding_proj"

test: test-language test-script test-native test-js test-adapters

test-language:
    moon -C {{smoke}} check --target wasm --deny-warn
    moon -C {{smoke}} check --target js --deny-warn --no-mbti
    moon -C {{smoke}} check --target native --deny-warn --no-mbti
    moon -C {{smoke}} test --target wasm --deny-warn
    moon -C {{smoke}} test --target js --deny-warn
    moon -C {{smoke}} test --target native --deny-warn

test-script:
    moon run {{smoke}}/configured.mbtx --target wasm --deny-warn
    moonx {{smoke}}/configured.mbtx

test-native:
    moon -C {{smoke}} build native --target native
    cc -I"${MOON_HOME:-$HOME/.moon}/include" {{smoke}}/native/host.c {{smoke}}/_build/native/debug/build/native/native.a "${MOON_HOME:-$HOME/.moon}/lib/libbacktrace.a" -lm -o {{smoke}}/_build/native-host
    {{smoke}}/_build/native-host

test-js:
    moon -C {{bindings}} check --target js --deny-warn
    moon -C {{bindings}} test --target js --deny-warn
    moon -C {{bindings}} build --target js --release --deny-warn

# Current external binding modules and cross-target I/O.
test-adapters:
    moon -C ts2moonbit-migration/assets/adapter-smoke check --target js --deny-warn
    moon -C ts2moonbit-migration/assets/adapter-smoke test --target js --deny-warn
    moon -C ts2moonbit-migration/assets/adapter-smoke test --target native --package example/adapter_smoke/cross --deny-warn
    moon -C ts2moonbit-migration/assets/adapter-smoke build --target js --release --deny-warn
    node --test ts2moonbit-migration/assets/adapter-smoke/smoke.test.mjs

# Nix is opt-in; this target requires the selected host's Nix installation.
test-nix host:
    nix build path:./moonbit-practice/assets/nix-smoke#checks.{{host}}.output --no-link
