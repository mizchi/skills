# Single package

The smallest layout: one `package.json` at the repository root. `workflow-templates/release.yml` works as is, and `scripts/migrate.sh` generates it.

## Example `package.json`

```json
{
  "name": "my-pkg",
  "version": "0.1.0",
  "description": "...",
  "license": "MIT",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/owner/repo.git"
  },
  "publishConfig": { "access": "public" },
  "files": ["dist", "README.md", "LICENSE"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p . --noEmit",
    "test": "vitest run"
  }
}
```

- Do not run build or test from `prepublishOnly`. CI runs them explicitly, so they would run twice. Build by hand before the manual first publish
- `repository.url` is used for provenance verification. A repository renamed after a fork that still carries the old URL fails with `E422`

## First publish → trust → first tag

```bash
# the user runs these
npm whoami || npm login --auth-type=web
pnpm run build && npm publish --access public
npm trust github my-pkg --repo owner/repo --file release.yml --allow-publish -y

# from then on
npm version 0.2.0 --no-git-tag-version
GITHUB_TOKEN=$(gh auth token) npx git-cliff --tag v0.2.0 -o CHANGELOG.md
git commit -am "chore: release 0.2.0"
git tag v0.2.0 && git push origin main v0.2.0
```

`npm version 0.2.0` without `--no-git-tag-version` creates the commit and an annotated tag `v0.2.0` by itself, but the generated CHANGELOG.md would then land after the tag. Keep the explicit steps above so the tagged commit contains the changelog section the release workflow reads.
