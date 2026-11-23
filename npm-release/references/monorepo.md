# pnpm workspaces monorepo

The default is **lockstep**: every published package has the same version and one `v<version>` tag publishes all of them. This avoids reasoning about `workspace:*` dependencies between packages.

## Layout

```
.
├── package.json          # private: true (the root is not published)
├── pnpm-workspace.yaml
├── CHANGELOG.md          # one for the whole repository
└── packages/
    ├── core/package.json # @scope/core
    └── cli/package.json  # @scope/cli, dependencies: { "@scope/core": "workspace:*" }
```

Each package's `package.json` sets `repository.directory`:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/owner/repo.git",
  "directory": "packages/core"
}
```

## Publish with pnpm pack → npm publish

`npm publish` does not replace `workspace:*`. `pnpm pack` writes a tarball with the versions replaced, and the npm CLI publishes it (OIDC support is most mature in the npm CLI). Pack dependencies before their dependents.

The manual first publish uses the same shape:

```bash
pack=$(mktemp -d)
for p in core cli; do (cd packages/$p && pnpm pack --pack-destination "$pack"); done
for t in "$pack"/*.tgz; do npm publish "$t" --access public; done
```

## Registering the trusted publisher

`npm trust` has no workspace support, so run it per package. `scripts/trust.sh` picks the non-private packages under `packages/*` and loops over them. From this skill's directory:

```bash
scripts/trust.sh --dry-run <repo-path>   # show the targets
scripts/trust.sh <repo-path>             # run (2FA once, on the first request)
```

## Changes to release.yml

Replace the version check and the publish step of `workflow-templates/release.yml` with the following:

```yaml
      - name: Tag matches the package versions
        run: |
          for p in packages/*/package.json; do
            v=$(node -p "require('./$p').version")
            if [ "v$v" != "$GITHUB_REF_NAME" ]; then echo "$p is $v, tag is $GITHUB_REF_NAME"; exit 1; fi
          done
      # ...typecheck / test / build...
      - run: npm install -g npm@11
      - name: Publish
        run: |
          mkdir -p "$RUNNER_TEMP/pack"
          for p in core cli; do   # dependencies first
            (cd "packages/$p" && pnpm pack --pack-destination "$RUNNER_TEMP/pack")
          done
          for t in "$RUNNER_TEMP"/pack/*.tgz; do npm publish "$t" --access public; done
```

The pack order is written out because glob order does not guarantee dependency order.

## Bumping the version

```bash
pnpm -r --filter './packages/*' exec npm version 0.3.0 --no-git-tag-version
GITHUB_TOKEN=$(gh auth token) npx git-cliff --tag v0.3.0 -o CHANGELOG.md
git commit -am "chore: release 0.3.0"
git tag v0.3.0 && git push origin main v0.3.0
```

## When it fails midway

If the `npm publish` loop stops partway, only some packages have the new version. A published version cannot be published again, so bump the patch and release every package again. If it failed before publishing, recreating the tag is enough.

## When independent versions are needed

To release packages on separate schedules, tag as `<dir>-v<version>` (for example `core-v1.2.0`), derive the target directory from the tag in the workflow, and pack and publish only that package. Set `on.push.tags` to `['*-v*']`. A dependent's `workspace:*` is replaced with the version at publish time, so release dependencies first. Stay with lockstep until this is needed.

Two things to watch with per-package tags. GitHub creates no push event when more than three tags are pushed at once, so push at most three tags per `git push`. Each tag starts its own workflow run and the runs are parallel, so push a dependency's tag first and wait for it to publish before pushing its dependents. If the repository also uses `<name>-v<version>` tags for another registry, give the npm tags a distinct infix such as `<name>-npm-v<version>` so the trigger pattern cannot match the others.
