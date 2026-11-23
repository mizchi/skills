# OSS release policy

What a repository must have before a version is released. The requirements depend on the version: `0.0.x` is a prototype, `0.1.0` and later is a public release that other people are expected to use and contribute to.

Check a repository with the script next to this skill:

```sh
node <skill>/scripts/release-policy.mjs <repo>              # check against the current version
node <skill>/scripts/release-policy.mjs <repo> --as 0.1.0   # what is left before the first public release
node <skill>/scripts/release-policy.mjs <repo> --json
```

The script reads files and matches patterns. It confirms that each piece is present; it does not run the release. The items marked "review" below need a reader.

## Stages

| | `0.0.x` prototype | `0.1.0` and later |
|---|---|---|
| Requirements below | reported as `todo`, exit code 0 | a missing one is `FAIL`, exit code 1 |
| Breaking changes | any release | announce in the release page with the replacement |
| Release page | changelog section alone is enough | summary plus changelog section |

During `0.0.x`, release as often as the work needs and skip any item. Run `--as 0.1.0` before bumping to `0.1.0` and close every `FAIL` first. An existing project keeps its established license, filenames and tools; the policy decides defaults for new work.

## Requirements from 0.1.0

### Release

- **npm is the default distribution.** Publish from a workflow that runs on a `v*` tag push, with npm trusted publishing (OIDC). Do not store an npm token in the repository. The first version of a package is published by hand because a trusted publisher can only be registered for an existing package. The `npm-release` skill has the full procedure: first publish, `npm trust`, tag protection, and the release workflow.
- **The tag is the release.** The tag `v<version>` must equal the manifest version. The workflow checks this, runs the project checks, publishes, and then creates the GitHub Release page.
- **Each tag gets a release page with a summary.** Write `.github/releases/v<version>.md` before tagging: who benefits, one task to try with real input and the expected result, and what callers of the previous version must change. The workflow puts this summary above the generated changelog section. See "Release page" in SKILL.md for how to write it.
- **CHANGELOG.md is generated.** Use git-cliff with the template `cliff.toml`. Do not edit entries by hand: fix the commit message or the configuration and regenerate. Review the generated section against the release diff before committing it.
- **Outside contributors are credited by name.** The template adds `by @login` to each entry whose author is not the repository owner or a bot, and lists first-time contributors. Run the generator with `GITHUB_TOKEN` set so the lookups succeed. For a repository owned by an organization, replace the owner comparison in `cliff.toml` with the maintainer list.

Release steps with the template:

```sh
npm version <version> --no-git-tag-version
GITHUB_TOKEN=$(gh auth token) pnpm changelog     # writes CHANGELOG.md with contributor credits
$EDITOR .github/releases/v<version>.md           # from .github/release-notes.md
git commit -am "chore: release <version>"
git tag v<version>
git push origin main v<version>
```

### Repository

- **CI** runs the project checks on every pull request. Start from the template `.github/workflows/ci.yml`; the release workflow is `.github/workflows/release.yml` next to it.
- **LICENSE** holds the full text. Prefer MIT or Apache-2.0 for a new project, and keep the SPDX identifier in the manifest and the README in agreement with it.
- **CONTRIBUTING.md** exists and holds the development setup: prerequisites, install, the check command, and the release steps. Setup instructions for developers belong here and not in the README.
- **Toolchain versions are pinned in one place.** Node.js (24+) and pnpm (12+) in `mise.toml`, with `packageManager` in package.json equal to the pnpm version; Rust in `rust-toolchain.toml` at an exact version. Workflows install them with `jdx/mise-action` (rustup reads `rust-toolchain.toml` by itself) instead of naming versions of their own, so a version bump is one edit and CI runs what contributors run.
- **English is the primary language** of README.md, CONTRIBUTING.md, CHANGELOG.md, release pages and commit messages. Japanese is supplementary: put it in `README.ja.md` or under `docs/`, link it from the English document, and treat the English text as the source of truth when they differ.

### README

The README answers "can I use this for my problem?" for someone who has not installed anything yet.

- Opens with the name and one sentence saying what the project is for.
- **Easy to try from the user's side.** Installation shows how a user gets the released package. Quick Start follows it with something to paste and the result to expect, so a reader goes from install to an observable result without leaving the page.
- **Quick Start leads somewhere.** It ends with links to the next documents: API reference, configuration, guides.
- **Short.** Keep it under about 200 lines. Move reference tables, advanced configuration, architecture notes and long examples to `docs/` and link them.
- **No development setup.** Link to CONTRIBUTING.md instead.
- Names the license and links to the contribution guide.

Review (not checked by the script): follow the Quick Start in a clean project with only the stated prerequisites, against the version that the install command selects.

## Check reference

`FAIL` blocks a `0.1.0+` release. `warn` is a recommendation at every stage.

| Check | Level | Passes when |
|---|---|---|
| `license.file` | required | LICENSE (or LICENSE-MIT / LICENSE-APACHE) exists |
| `license.preferred` | warn | the license text is MIT or Apache-2.0 |
| `license.manifest` | required | the manifest license matches the LICENSE file |
| `readme.exists` | required | README.md exists |
| `readme.english` | required | Japanese is under 10% of the prose |
| `readme.purpose` | required | a title and a prose sentence come before the first section |
| `readme.install` | required | a section title contains "Install" |
| `readme.quickstart` | required | a Quick Start / Usage / Getting Started section contains a code block |
| `readme.example` | required | at least one code block |
| `readme.license` | required | a License section or a link to LICENSE |
| `readme.contributing` | warn | links to the contribution guide |
| `readme.length` | warn | at most 200 lines |
| `readme.dev-setup` | warn | a Development / Building section holds only a pointer |
| `contributing.exists` | required | CONTRIBUTING.md (or CONTRIBUTE.md, `.github/`, `docs/`) exists |
| `contributing.english` | required | Japanese is under 10% of the prose |
| `contributing.setup` | required | contains a command |
| `ci.workflow` | required | a workflow triggers on `pull_request` |
| `release.tag-workflow` | required | a workflow triggers on tag push |
| `release.github-release` | required | that workflow creates a GitHub Release |
| `release.npm-publish` | required | that workflow runs `npm publish` (skipped for a private or non-npm package) |
| `release.package-fields` | required | package.json has `repository` (skipped as above) |
| `release.npm-oidc` | warn | `id-token: write` and no `NPM_TOKEN` / `NODE_AUTH_TOKEN` |
| `release.summary` | warn | `.github/releases/v<version>.md` exists for the current version |
| `changelog.generator` | required | git-cliff, changesets, release-please or conventional-changelog is set up |
| `changelog.contributors` | required | the generator credits authors (git-cliff remote fields, or changesets `changelog-github`) |
| `changelog.file` | required | CHANGELOG.md exists |
| `toolchain.node` | warn | `mise.toml` pins `node` 24+ and `pnpm` 12+ to versions, and `packageManager` (if set) names the same pnpm (skipped without package.json) |
| `toolchain.rust` | warn | `rust-toolchain.toml` pins `channel` to a version such as `1.99.0`, not `stable` (skipped without Cargo.toml) |
| `toolchain.ci` | warn | no workflow sets `node-version`, uses `pnpm/action-setup`, or installs `pnpm@…` globally (skipped without mise.toml) |
