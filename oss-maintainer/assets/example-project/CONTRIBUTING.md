# Contributing

From the copied project root, run `just init` with just and [APM](https://github.com/microsoft/apm) installed. This installs the locked project skills for Codex and Claude. See [AGENTS.md](AGENTS.md) for the project workflow.

Copy the example (including dotfiles) into its own Git repository. From its root, run:

```sh
pnpm install --frozen-lockfile
pnpm hooks
pnpm check
pnpm secrets
```

The hook scans staged files with secretlint. Use the bug form for unexpected output and the feature form for a new use case. For a fix, include the input and a regression test.

Use Conventional Commits, for example `fix: preserve empty trailing lines`. Before tagging a release, set the package version and run `pnpm changelog` from a checkout with complete commit and tag history. Review and commit the generated CHANGELOG.md. Draft the release page using the [release notes template](.github/release-notes.md).

## Dependency updates

Install the Renovate GitHub App for this repository. Run the CI workflow once, then protect the default branch in Settings → Rules → Rulesets. Require pull requests, require the GitHub Actions status check named `check`, and require branches to be up to date before merging. Keep Renovate subject to these checks.

Renovate merges passing update PRs after seven days from publication, including major versions. CI runs tests and audits the lockfile(s). An audit error blocks the check. Releases without a timestamp wait for review. Packages in the mizchi npm scope and Actions hosted by mizchi skip the age gate and still run the same CI. For unscoped npm packages or Rust crates, verify registry ownership before adding exact names in a datasource-specific rule. Revisit exceptions after ownership transfers.
