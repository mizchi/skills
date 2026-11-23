# Contributing

From the copied project root, run `just init` with just and [APM](https://github.com/microsoft/apm) installed. This installs the locked project skills for Codex and Claude. See [AGENTS.md](AGENTS.md) for the project workflow.

Copy the whole workspace into its own Git repository. Install rustup and just, then run `just check` for formatting, Clippy and tests. rustup installs the Rust version pinned in [rust-toolchain.toml](rust-toolchain.toml) on first use. Use the bug form for unexpected counts and the feature form to describe a new use case.

Run `just bench` to measure the mixed-line input. Criterion builds its sample input outside the timed loop. To evaluate the tests, install `cargo install cargo-mutants --version 27.1.0 --locked` and run `just mutants`. Inspect surviving mutations in mutants.out and add a test if they change observable behavior.

Node.js (24+) and pnpm (12+) for the repository tooling are pinned in [mise.toml](mise.toml). Run `mise install`, then `pnpm install --frozen-lockfile` and `pnpm hooks` to enable the staged-file secretlint check. Run `pnpm secrets` for a full scan. Use Conventional Commits.

## Release

For this single-crate example, keep the package.json release version aligned with the crate version.

1. Run `GITHUB_TOKEN=$(gh auth token) pnpm changelog` from a full checkout. git-cliff writes CHANGELOG.md and credits outside contributors by GitHub login. Review the generated section against the release diff.
2. Write `.github/releases/v<version>.md` from the [release notes template](.github/release-notes.md), including a runnable user scenario. It becomes the top of the release page.
3. Commit, tag `v<version>`, and push the branch and the tag. The [release workflow](.github/workflows/release.yml) checks the tagged commit and creates the release page from the summary and the changelog section.

## Dependency updates

Install the Renovate GitHub App for this repository. Run the CI workflow once, then protect the default branch in Settings → Rules → Rulesets. Require pull requests, require the GitHub Actions status check named `check`, and require branches to be up to date before merging. Keep Renovate subject to these checks.

Renovate merges passing update PRs after seven days from publication, including major versions. CI runs tests and audits the lockfile(s). An audit error blocks the check. Releases without a timestamp wait for review. Packages in the mizchi npm scope and Actions hosted by mizchi skip the age gate and still run the same CI. For unscoped npm packages or Rust crates, verify registry ownership before adding exact names in a datasource-specific rule. Revisit exceptions after ownership transfers.
