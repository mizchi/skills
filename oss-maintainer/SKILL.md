---
name: oss-maintainer
description: Write or review OSS READMEs, contribution guides (CONTRIBUTING.md or CONTRIBUTE.md), changelogs, and release pages, or scaffold a Node.js or Rust OSS project with CI and contributor tooling.
---

# OSS maintainer documentation

Identify the reader's next decision and the version they are reading about. Follow the project's existing language, filenames, and conventions. Edit the requested document. Link to the canonical home of details that another document already maintains.

## Initialize a project template

Ship a root AGENTS.md with project-specific checks, an apm.yml declaring external skills and targets, and the generated apm.lock.yaml. From the copied project root, run `just init` to replay the lock with `apm install --frozen`. Keep the manifest and lock under version control and ignore the generated cache and deployed skill copies. Include an unanchored `.env` entry in every project template’s .gitignore so it covers nested packages too.

## Scaffold a Node.js project

Copy [the example project](assets/example-project/README.md) including its dotfiles into the new repository. For a single-purpose library, keep the implementation in `src/`. For a medium-sized application, put deployable applications in `apps/<name>/` and shared packages in `packages/<name>/`. Add both globs to pnpm-workspace.yaml, give each workspace its own manifest, and check all affected workspaces in CI.

Use Node.js 24+ and pnpm 12+, with compatible patch versions recorded in the manifest and CI. Prefer Vite+ for formatting, linting, testing, and builds when a build is needed. Keep issue forms for bugs and feature requests in `.github/ISSUE_TEMPLATE/`. Enable the secretlint pre-commit hook from the new repository root and run secretlint in GitHub Actions as well.

For a new project choose MIT or Apache-2.0, include the full license text, and match its SPDX identifier in the manifest and README. The example uses MIT. Set the copyright holder before publishing. Preserve established licensing when updating existing projects.

## Scaffold a Rust workspace

Copy [the Rust example](assets/example-rust-project/README.md) including dotfiles. Pin the compiler and components in `rust-toolchain.toml`, the filename rustup discovers. Use a virtual workspace at the root and place member packages under `crates/<name>/`. Commit the workspace lockfile.

Run `just check` for fmt, Clippy across all targets, and workspace tests. Keep Criterion benchmarks in the owning crate’s `benches/` directory with `harness = false`. Use `just bench` for measurements and the benchmark’s `--test` mode for a CI smoke test. Use `just mutants` to check whether tests catch changes to production logic. The example preserves the issue forms, pre-commit secret scanning, changelog generation, and release guide from the Node.js template.

## Configure dependency automerge

Start with the template’s renovate.json and complete the GitHub ruleset setup in its CONTRIBUTING.md. Use seven days as the sample minimum release age. Require a successful test and dependency audit on the proposed lockfiles. The CI job named `check` covers both. Require this check on the target branch and keep Renovate subject to the rule. For a security-alert PR that bypasses the normal age filter, leave the merge decision to a maintainer.

Use registry namespaces for mizchi-owned npm packages and GitHub owner paths for Actions. Rust crates and unscoped npm packages need individual ownership checks: verify the registry owners and then add the exact package name under the matching datasource. Mirror npm exceptions in pnpm’s minimumReleaseAgeExclude. Keep test and audit requirements identical for all publishers. [Renovate automerge](https://docs.renovatebot.com/key-concepts/automerge/)

## README — Can I use this for my problem?

Use the [Solid README](https://github.com/solidjs/solid#readme) as the layout reference. Lead with the project name, a one-sentence purpose, and links to the main reader tasks. Show the public API with a tiny input and its observable result before setup. Where useful, generate an original project banner with imagegen, store it inside the project, and keep the introduction readable with images disabled. A banner is optional. Add badges only for live project resources.

Include explicit Installation and Quick Start sections. Finish the README with Reference projects, linking each influence and naming what the project borrowed. Open with the concrete task the project solves. Show a minimal path from installation to an observable result. Include prerequisites where they first matter. For a library, show the import and a working call. For a CLI, show the command, a small input, and the expected output. Check the example against the version the install command actually selects, especially when the default branch contains unreleased changes.

Place limitations that affect adoption near the example. Link to deeper API, configuration, and contribution guidance where the reader would need them. Review by following the quickstart from a clean consumer project with only the stated prerequisites.

The ripgrep README opens with the search task, then names the files a default search skips and gives the switch that includes them. Borrow this order when a default changes what readers will see in their first run. For a formatter, for example, say which files it selects and whether the first invocation writes changes. [ripgrep 14.1.1 README](https://github.com/BurntSushi/ripgrep/blob/14.1.1/README.md)

## Contribution guide — How do I get a change reviewed?

Keep the existing guide's filename, including CONTRIBUTE.md. For a new guide on GitHub, use CONTRIBUTING.md unless the project specifies another name. Start with the entry point for the contribution at hand: an issue template for a bug, a discussion for a proposal if the project uses one, or a pull request for a patch.

Walk a first-time contributor from a fresh checkout to one focused local check. Derive setup, generated-file steps, and test commands from the repository's task runner and CI. Describe what a reviewer needs to reproduce the result, such as a regression test or a screenshot for a visible change. Include sign-off, agreements, or review commitments only when established by the project. Verify that a contributor can follow the path with ordinary contributor permissions.

GitHub CLI answers whether to open an issue or a PR before explaining how to build. Its build section then tells contributors how to invoke the binary they just compiled. Borrow both decisions: give one example on each side of your project’s issue/PR boundary, then show how to exercise a local change when a released binary may already be on PATH. Derive labels and approval rules from the target project. [GitHub CLI v2.60.0 contribution guide](https://github.com/cli/cli/blob/v2.60.0/.github/CONTRIBUTING.md)

## CHANGELOG — What changed between two versions?

Generate CHANGELOG.md with Conventional Changelog from Conventional Commits and version tags. Use the example’s `pnpm changelog` command with full Git history. Put observable behavior in commit subjects and migration details in breaking-change footers. Review the generated entries against the release diff. Correct the generator inputs or configuration when entries are missing.

Keep a Changelog demonstrates its format with its own releases. In 1.1.2, a newly available translation goes under Added and a correction to an existing translation goes under Fixed. Apply the same test to a mixed PR: if it adds an output format and corrects escaping in an existing format, record the two effects in generator inputs so the released entries are independently searchable. [Keep a Changelog, worked example](https://keepachangelog.com/en/1.1.0/)

## Release page — Should I upgrade, and how?

Include a use-case guide in each release page: identify the user’s task, show how to perform it with the released version, and give an observable result. For a bug fix, walk through the formerly failing case. Address users of the previous supported version. Lead with the change most likely to affect their upgrade decision. Identify affected users, required actions, compatibility constraints, and relevant known issues. Show a before/after example for a migration when it saves guesswork. Point readers to the appropriate package or download for this tag, then link to the full changelog or comparison. Verify the tag, version, artifact names, and availability before describing a release as available.

React 19 introduces Actions by showing the same name-update form before and after adoption. Readers can see who now handles the pending state. The opening also links directly to the upgrade guide. For a release with a major new API, keep the task and input constant across examples so the changed responsibility is visible. Give existing users a direct path to required migration steps. [React 19 release announcement](https://react.dev/blog/2024/12/05/react-19)

For example, if a CLI's JSON flag changed in v2, the README demonstrates the current invocation. The v2 changelog records “Renamed `--json` to `--format json`.” The release page tells people upgrading from v1 to update scripts that pass the old flag and shows the replacement command. The contribution guide needs an edit only if the contributor workflow also changed.

## Review output

Report the first point at which the intended reader would get stuck, cite the relevant passage, and propose a concrete edit backed by repository evidence. Distinguish commands you exercised from examples you could only inspect. Flag unresolved facts, such as a missing release asset, at the passage they affect.
