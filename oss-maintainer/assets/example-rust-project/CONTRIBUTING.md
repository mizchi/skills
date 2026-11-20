# Contributing

From the copied project root, run `just init` with just and [APM](https://github.com/microsoft/apm) installed. This installs the locked project skills for Codex and Claude. See [AGENTS.md](AGENTS.md) for the project workflow.

Copy the whole workspace into its own Git repository. Install rustup and just, then run `just check` for formatting, Clippy and tests. Use the bug form for unexpected counts and the feature form to describe a new use case.

Run `just bench` to measure the mixed-line input. Criterion builds its sample input outside the timed loop. To evaluate the tests, install `cargo install cargo-mutants --version 27.1.0 --locked` and run `just mutants`. Inspect surviving mutations in mutants.out and add a test if they change observable behavior.

With Node.js 24.11+ on the 24.x line (or 26+) and pnpm 12+, run `pnpm install --frozen-lockfile` and `pnpm hooks` to enable the staged-file secretlint check. Run `pnpm secrets` for a full scan. Use Conventional Commits. For this single-crate example, keep the package.json release version aligned with the crate version before running `pnpm changelog` from a full checkout. Include a runnable user scenario in the [release notes](.github/release-notes.md).

## Dependency updates

Install the Renovate GitHub App for this repository. Run the CI workflow once, then protect the default branch in Settings → Rules → Rulesets. Require pull requests, require the GitHub Actions status check named `check`, and require branches to be up to date before merging. Keep Renovate subject to these checks.

Renovate merges passing update PRs after seven days from publication, including major versions. CI runs tests and audits the lockfile(s). An audit error blocks the check. Releases without a timestamp wait for review. Packages in the mizchi npm scope and Actions hosted by mizchi skip the age gate and still run the same CI. For unscoped npm packages or Rust crates, verify registry ownership before adding exact names in a datasource-specific rule. Revisit exceptions after ownership transfers.
