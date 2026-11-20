# line-count

![](docs/banner.jpg)

Count non-empty lines in a string, including lines containing only spaces.

[Installation](#installation) · [Quick Start](#quick-start) · [Contributing](CONTRIBUTING.md)

## At a glance

```rust
use line_count::count_nonempty;

assert_eq!(count_nonempty("alpha\r\n\r\nbeta"), 2);
```

## Installation

Install rustup and build from this workspace root. Cargo uses the version in rust-toolchain.toml.

```sh
cargo build --workspace --locked
```

## Quick Start

```sh
cargo run --quiet -p line-count --example count
# 2
```

The example passes two words separated by a blank line. See [Contributing](CONTRIBUTING.md) for checks, benchmarks, and mutation testing.

## License

[MIT](LICENSE)

## Reference projects

- [Solid](https://github.com/solidjs/solid#readme) introduces its API with a small working example before setup.
- [Criterion.rs](https://github.com/criterion-rs/criterion.rs) supplies the benchmark harness.
- [cargo-mutants](https://github.com/sourcefrog/cargo-mutants) checks which changes to production code the tests detect.
