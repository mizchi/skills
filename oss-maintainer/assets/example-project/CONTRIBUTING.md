# Contributing

From the copied project root, run `just init` with just and [APM](https://github.com/microsoft/apm) installed. This installs the locked project skills for Codex and Claude. See [AGENTS.md](AGENTS.md) for the project workflow.

## Setup

Copy the example (including dotfiles) into its own Git repository. Node.js (24+) and pnpm (12+) are pinned in [mise.toml](mise.toml); install [mise](https://mise.jdx.dev) and CI uses the same versions. From the repository root, run:

```sh
mise install
pnpm install --frozen-lockfile
pnpm hooks
pnpm check
pnpm secrets
```

The hook scans staged files with secretlint. Use the bug form for unexpected output and the feature form for a new use case. For a fix, include the input and a regression test.

Use Conventional Commits, for example `fix: preserve empty trailing lines`.

## Release

1. Set the package version, then run `GITHUB_TOKEN=$(gh auth token) pnpm changelog` from a checkout with complete commit and tag history. git-cliff writes CHANGELOG.md and credits outside contributors by GitHub login. Review the generated section against the release diff.
2. Write `.github/releases/v<version>.md` from the [release notes template](.github/release-notes.md). It becomes the top of the release page.
3. Commit, tag `v<version>`, and push the branch and the tag. The [release workflow](.github/workflows/release.yml) checks the tagged commit, publishes to npm, and creates the release page from the summary and the changelog section.

The example package is private, so the workflow skips the npm step. To publish, remove `private`, add the `repository` field, publish the first version by hand, and register the workflow as an npm trusted publisher (the command is at the top of the workflow file).

## Dependency updates

Install the Renovate GitHub App for this repository. Run the CI workflow once, then protect the default branch in Settings → Rules → Rulesets. Require pull requests, require the GitHub Actions status check named `check`, and require branches to be up to date before merging. Keep Renovate subject to these checks.

Renovate merges passing update PRs after seven days from publication, including major versions. CI runs tests and audits the lockfile(s). An audit error blocks the check. Releases without a timestamp wait for review. Packages in the mizchi npm scope and Actions hosted by mizchi skip the age gate and still run the same CI. For unscoped npm packages or Rust crates, verify registry ownership before adding exact names in a datasource-specific rule. Revisit exceptions after ownership transfers.
