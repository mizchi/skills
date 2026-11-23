---
name: npm-release
description: Release npm libraries with a manual first publish, `npm trust` for OIDC Trusted Publishing, then tag-triggered automatic publishes (`git push` of a `v*` tag). Use when creating a new npm library and shipping it, setting up or fixing automated npm releases, wiring GitHub Actions to publish on tag push, enabling npm provenance, or migrating a repo off release-please / NPM_TOKEN. Covers single-package and pnpm workspaces monorepo.
---

# npm-release

Release an npm library in four stages. release-please and `NPM_TOKEN` are not used.

1. **The user publishes the first version by hand.** This creates the name on npm. A trusted publisher can only be registered for an existing package.
2. **Register an OIDC trusted publisher with `npm trust github`.** The CLI is enough; the npmjs.com UI is not needed.
3. **Protect `v*` tags with a ruleset** (`scripts/protect-tags.sh`). Whoever can push a tag can publish.
4. **From then on, pushing a `v*` tag publishes.** `.github/workflows/release.yml` publishes through OIDC and npm attaches provenance.

- Node.js 24 and npm 11.15+ (`npm trust` needs it; OIDC publishing in CI needs npm 11.5.1+)
- Single package and pnpm workspaces monorepo are both covered. A monorepo defaults to lockstep versions. See [references/single-package.md](references/single-package.md) and [references/monorepo.md](references/monorepo.md)
- CHANGELOG.md is generated with git-cliff and is not written by hand. Outside contributors are credited with `by @login`. On tag push the section for the version becomes the GitHub Release body. The requirements from 0.1.0 and the `cliff.toml` / `release.yml` templates are in the `oss-maintainer` skill (`references/release-policy.md`, `assets/example-project/`)
- **The release-please + GitHub App flow and `NPM_TOKEN` publishing are retired.** When you find a repository still releasing that way, migrate it to this flow ("Migrating from release-please" below) instead of repairing the old setup

## When to use

- "I want to create an npm library and release it", "first publish"
- "publish to npm on tag push", "OIDC / Trusted Publisher / provenance / npm trust"
- Migrating off release-please or `NPM_TOKEN`

Related skills: `gh-fix-ci` for failing CI, `oss-maintainer` for the release policy and changelog template, `conventional-changelog` for the commit format, `moonbit-practice` for shipping MoonBit to npm.

## Overall flow

```
[once, by the user]
  npm login → npm publish --access public          (claim the name)
  npm trust github <pkg> --repo <owner>/<repo> \
    --file release.yml --allow-publish -y          (register OIDC)
  protect-tags.sh <owner>/<repo>                   (v* tags: admins only)

[every release]
  bump version to x.y.z, generate CHANGELOG.md with git-cliff, commit
  tag vx.y.z
  git push origin main vx.y.z
      ▼
  release.yml (on: push: tags: v*)
    check tag == package.json version → typecheck / test / build
    npm publish through OIDC (with provenance)
    create the GitHub Release from the CHANGELOG section
```

## Before starting: find the current stage

A repository can have the workflow while the trusted publisher was never registered and no tag was ever published (only the version was bumped). Check four things and start from the first missing stage.

```bash
npm view <pkg> version dist-tags --json          # latest on npm; older than package.json means an unpublished version
git ls-remote --tags origin                      # are there v* tags on the remote?
gh run list --limit 5                            # has the publish workflow ever run?
gh api repos/<owner>/<repo>/rulesets --jq '.[].name'   # is "protect release tags" there?
```

- `npm whoami` returning 401 means not logged in. `npm trust list <pkg>` needs a login too, so ask the user to confirm the registration in Phase 2
- If package.json is ahead of npm with unpublished versions, skip that number and release the next one. Regenerate the changelog so the unpublished changes land in the version that ships
- **The order is ruleset → trust → tag push.** A tag pushed before the trust registration fails with an authentication error and has to be recreated. Do not create the tag until the registration is confirmed

## Phase 0: package.json prerequisites

Every published `package.json` needs the following. `scripts/migrate.sh` fills the gaps for a single package.

- `"name"`, `"version"`, `"license"`
- `"repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" }`
  - **Required.** Provenance verification compares it with the workflow's repository; a mismatch fails the publish with `E422`
  - In a monorepo also set `"directory": "packages/<dir>"`
- `"files"`: list what is published (do not use `.npmignore`)
- `"publishConfig": { "access": "public" }` (required for a scoped public package)
- `"engines": { "node": ">=24" }` (match the CI Node version)

Check the contents before publishing with `npm pack --dry-run`. In a monorepo use `pnpm pack` and confirm that `workspace:*` is replaced with real versions.

## Phase 1: first publish (the user runs it)

**The agent does not run this.** It writes to the npm account and needs browser authentication or an OTP, so show the commands and let the user run them. In Claude Code, `! <command>` gets as far as `npm login --auth-type=web`; `npm publish` and `npm trust` ask for 2FA and do not pass (see "Where to run commands that ask for 2FA").

```bash
npm whoami || npm login --auth-type=web
pnpm install --frozen-lockfile && pnpm run build   # adapt to the repo
npm publish --access public                         # monorepo: references/monorepo.md
npm view <pkg> versions                             # confirm
```

- This publish carries no provenance because it comes from a local machine. If that matters, claim the name with a throwaway `0.0.1` and make the first real release through a tag
- If the package already exists on npm, start at Phase 2

## Phase 2: register the trusted publisher with npm trust (the user runs it)

Requirements: npm 11.15.0+, **2FA enabled on the account**, and the package exists on npm. The first request asks for 2FA.

```bash
npm trust github <pkg> --repo <owner>/<repo> --file release.yml --allow-publish -y
npm trust list <pkg>
```

### Where to run commands that ask for 2FA

`npm trust` and a local `npm publish` require 2FA. **Without a TTY they exit immediately with `EOTP`**: npm prints the authentication URL and does not wait for the browser step. The agent's Bash tool and Claude Code's `! <command>` have no TTY, so retrying gives the same result, and the URL is masked.

```
npm error code EOTP
npm error This operation requires a one-time password.
npm error Open this URL in your browser to authenticate:
```

Two ways through:

- **Run it in a pane with a TTY (works with passkeys and security keys).** In a Rex terminal the agent can open a pane next to itself and start the command there; the user only presses Enter in that pane and completes 2FA in the browser. npm waits for the authentication and then registers.

  ```bash
  rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=right -c "$PWD" --keep-open --json -- \
    npm trust github <pkg> --repo <owner>/<repo> --file <workflow>.yml --allow-publish -y
  rex capture -s "$REX_SESSION" -b <block_id> --trim | tail    # look for "Trust configuration created successfully"
  ```

  Without Rex, ask the user to run the same command in another terminal
- **With an authenticator app (TOTP), add `--otp=<6 digits>`.** This passes without a TTY, so `!` works

Success prints `Trust configuration created successfully for <pkg>` with `id` / `file` / `repository`. Continue only after seeing it.

### Notes

- `--file` is the **filename only** inside `.github/workflows/` (no path). Renaming the workflow means registering again
- `--allow-publish` (or `--allow-stage-publish`) is required; the registration cannot be created without it
- If the workflow uses a GitHub Environment, pass the same name with `--env <name>`
- **No workspace support.** In a monorepo run it per package: `scripts/trust.sh <repo-path>` lists the non-private packages and loops over them (`--dry-run` only prints)
- Registering the same combination twice is an error. To change one, find the ID with `npm trust list`, run `npm trust revoke <pkg> --id <id>`, and create it again

Recommended afterwards: set the package's Settings → Publishing access to "Require two-factor authentication and disallow tokens". Publishing from the trusted publisher keeps working, and a leaked token can no longer publish.

## Phase 2.5: protect v* tags with a ruleset

A tag push triggers the publish, so restrict creating, moving, and deleting `v*` tags to repository admins. This changes repository settings; confirm with the user before running it.

```bash
scripts/protect-tags.sh <owner>/<repo>   # from this skill's directory
```

- Creates the tag ruleset `protect release tags`, or updates it when one with that name exists, so it is safe to rerun. Target `refs/tags/v*`, rules creation / update / deletion, bypass for the Repository admin role (`actor_id: 5`)
- `can_bypass: "always"` in the output confirms that the person running it can still push tags
- `gh release create` in release.yml attaches a Release to an already pushed tag and is not affected. A workflow that creates tags itself needs GitHub Actions added to the bypass list
- For another tag format (independent versions in a monorepo), pass `--pattern '*-v*'`
- Needs repository admin permission for the account shown by `gh auth status`

## Phase 3: release.yml (tag-triggered publish)

Template: [references/workflow-templates/release.yml](references/workflow-templates/release.yml). For a single package, `scripts/migrate.sh <repo-path>` generates it.

Required points:

- `on: push: tags: ['v*']` only
- `permissions: { contents: write, id-token: write }` (`id-token` for OIDC, `contents` to create the GitHub Release)
- `registry-url: https://registry.npmjs.org` on `actions/setup-node`
- `npm install -g npm@11` so the npm in CI supports OIDC even when the bundled one is older
- **Check that the tag equals the package.json version** before publishing. This stops a `v0.3.0` tag on a `0.2.0` manifest
- Run typecheck / test / build before publishing
- Do not pass `NPM_TOKEN` / `NODE_AUTH_TOKEN` from secrets. A token takes precedence over OIDC
- `--provenance` is unnecessary; trusted publishing attaches it
- A version containing `-` (pre-release) publishes with `--tag next` and leaves `latest` alone
- The GitHub Release body comes from the `## x.y.z` section of CHANGELOG.md, falling back to `--generate-notes` when the section is missing

## Phase 4: releasing (second release onwards)

```bash
# 1. bump the version
npm version 0.3.0 --no-git-tag-version          # single package (monorepo: references/monorepo.md)
# 2. generate CHANGELOG.md (creates the "## 0.3.0 (date)" section; review it against the diff)
GITHUB_TOKEN=$(gh auth token) npx git-cliff --tag v0.3.0 -o CHANGELOG.md
git commit -am "chore: release 0.3.0"
# 3. tag and push
git tag v0.3.0
git push origin main v0.3.0
gh run watch                                    # watch the release workflow
```

- `git push --follow-tags` only sends annotated tags. Name a lightweight tag explicitly as above
- With the tag ruleset in place, an admin push prints the message below. **This is success**: it records that the admin bypassed the rule. Only a `GH013` rejection is a failure

  ```
  remote: Bypassed rule violations for refs/tags/v0.3.0:
  remote: - Cannot create ref due to creations being restricted.
  ```
- Watch the workflow to the end with `gh run watch <run-id> --exit-status`. The publish step log shows `+ <pkg>@x.y.z` and `Provenance statement published to transparency log` when the version is out
- **The registry lags about a minute behind a successful workflow.** During that time `npm view <pkg>@x.y.z` is 404 and `dist-tags.latest` still shows the old version. Do not recreate the tag. Poll `dist-tags.latest` from `curl -s https://registry.npmjs.org/<pkg>` every 15 seconds a few times
- Verify with `npm view <pkg> versions` and `npm view <pkg>@0.3.0 --json | jq '.dist.attestations'` (attestations present means provenance is attached)
- If it failed before publishing: fix the cause and **recreate the tag** (`git tag -d v0.3.0 && git push origin :v0.3.0` → fix commit → tag again → push)
- A version that reached npm, even partly, cannot be published again. Bump the patch and release again
- Pre-release: version `0.3.0-rc.0`, tag `v0.3.0-rc.0`

## Migrating from release-please

The old flow is retired. A repository that still has `release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`, a `publish.yml` with `on: release`, or an `NPM_TOKEN` secret should be moved to this flow when you come across it:

1. Delete the release-please files (`migrate.sh` only warns about them)
2. Rewrite the publish workflow to trigger on tags. **Renaming the file means registering the trusted publisher again**, so in an existing repository it is faster to keep the name `publish.yml` and replace its contents with the template (`migrate.sh --workflow publish.yml --force <repo>`)
3. Check that the workflow filename in `npm trust list <pkg>` matches. Registrations made in the UI are listed too
4. Regenerate `CHANGELOG.md` with git-cliff. To keep what release-please wrote, add only the new section with `git-cliff --unreleased --tag vx.y.z --prepend CHANGELOG.md`. `--prepend` strips the existing header only when it is identical to `header` in cliff.toml; otherwise it writes a second header above the old one. Make the two match (and remove an empty `## Unreleased` heading) first, and set `tag_pattern` so the old release-please tags such as `<name>-v1.2.3` are still recognized
5. Protect `v*` tags with `scripts/protect-tags.sh <owner>/<repo>`
6. Delete the repository secrets the old flow used, such as the release-please GitHub App private key and `NPM_TOKEN` (`gh secret list --repo <owner>/<repo>`, then `gh secret delete <name> --repo <owner>/<repo>`). Once no repository uses the GitHub App, revoke its keys and delete the App

## Security notes

A tag push triggers the publish, so **whoever can push to the repository can publish**.

- Restrict `v*` tags to admins with the Phase 2.5 ruleset (check with `gh api repos/<owner>/<repo>/rulesets --jq '.[].name'`)
- Protect `.github/workflows/` with CODEOWNERS and read every pull request that touches it. A changed workflow publishes arbitrary code on the next tag
- Consider pinning third-party actions to a SHA
- Dependencies' install scripts run in the publishing job. Use `--ignore-scripts` where that matters
- Forks cannot create tags, so a fork pull request cannot trigger a publish

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `npm trust` fails with a 2FA / authentication error | 2FA is off, or the session uses a granular token / bypass 2FA | Enable 2FA and log in again with `npm login --auth-type=web` |
| `npm trust` / `npm publish` exits with `EOTP` every time | No TTY (the agent's Bash, Claude Code's `!`), so npm cannot wait for the browser step | Run it in a pane with a TTY (`rex split ... -- npm trust ...`), or pass `--otp=<6 digits>` for TOTP |
| `npm trust` says package not found | The package is not published yet | Do the manual publish in Phase 1 first |
| `npm trust` says already exists | The same configuration exists | `npm trust list` → `revoke --id` → create again |
| `npm publish` in CI fails with 404 / `ENEEDAUTH` / `EOIDCREQ` | Workflow filename mismatch, no `id-token: write`, or npm older than 11.5.1 | Compare `npm trust list` with the workflow name; check permissions and the npm version |
| `E422` provenance / repository mismatch | `package.json#repository.url` differs from the real repository | Set it to `git+https://github.com/<owner>/<repo>.git` |
| Token errors although OIDC is configured | `NODE_AUTH_TOKEN` / `NPM_TOKEN` is still in the environment | Remove the secret and the env entry |
| `workspace:*` is left in the published package | `npm publish` ran directly in a monorepo | `pnpm pack` → `npm publish <tgz>` |
| The workflow succeeded but `npm view <pkg>@x.y.z` is 404 | Registry lag of about a minute | Wait and check again. Do not recreate the tag |
| The workflow exists, npm's latest is old, and the remote has no tags | The version was bumped while the trusted publisher was never registered | Run the checks in "Before starting" → Phase 2 → 2.5 → push the tag |
| Tag push rejected with `GH013: Repository rule violations` | The ruleset allows only admins to create `v*` tags | Ask an admin to push. The restriction is intended; do not loosen it |
| The version check fails | The tag and the package.json version differ | Fix the version, commit, and recreate the tag |

## References

- `npm help trust`
- npm Trusted Publishing: https://docs.npmjs.com/trusted-publishers
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
