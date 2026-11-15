# Markdown link checks

The repository uses [lychee 0.24.2](https://github.com/lycheeverse/lychee/releases/tag/lychee-v0.24.2).
The installer downloads an official release into `.tools/lychee/0.24.2/` and
verifies its SHA-256 against [the pinned release metadata](../scripts/lychee-release.json).
Node 24 and `tar` are required; no global installation is needed.

```sh
pnpm links:install
pnpm lint:links              # local files, images, directories and Markdown fragments
pnpm lint:links:online       # HTTP(S) status codes and redirects
pnpm test:links
```

The same commands are available through
`just --justfile markdown-links.justfile install`, `check`, `online`, and `test`.
Use `just --justfile markdown-links.justfile list` to inspect the input scope.

## Scope

Inputs come from Git: tracked Markdown plus untracked, non-ignored additions,
including references, Japanese companions, dot-directory docs, and tool docs.
Installed skills, dependencies, and build products follow `.gitignore`.
Deleted input files leave the scan, while links still pointing to them fail.

`.jev-lint/rules/**/fixtures/` is deliberately excluded: those files are quoted
classifier inputs with artificial links. The rest of `.jev-lint/` is checked.
Ordinary documentation inside other `fixtures/` directories remains in scope.

Code fences and inline code are excluded by lychee's Markdown parser. Tests cover
reference links, Unicode/duplicate headings, URL-encoded paths, images, missing
files, missing fragments, HTTP 404, and config failures with an old report present.
An empty source selection fails instead of reporting a successful scan.

## Local and network checks

Local checks use `--offline` and validate GFM heading fragments. They make no
network requests and run on pull requests and pushes in
[the link workflow](../.github/workflows/markdown-links.yml).

HTTP(S) checks run manually or weekly. They check status codes and redirects,
with bounded concurrency/retries, and do not inspect remote page fragments:
client-rendered anchors need a browser to assess reliably. The independent local
check still validates local fragments. Failed HTTP statuses are not accepted or
cached as successes; 403/429 can mean access/rate-limit problems and need review.
CI supplies its read-only GitHub token through the environment. Local runs can
use an exported `GITHUB_TOKEN`; credentials do not belong in the configuration.

npm package pages are remapped to the exact package's official registry metadata,
because npm's website returns 403 to this automated client. This validates that
the package exists; it does not verify the browser page. Remaps are visible in
the report. Links to private GitHub repositories and bot-protected forums remain
failures requiring authenticated/manual review; they are not silently accepted.

[lychee.toml](../lychee.toml) excludes reserved example domains and private or
loopback network addresses used in templates. Add a narrow, documented exception
only after inspecting a result; do not accept all 404s or exclude an entire host
to make the report pass.

Reports are written to `.cache/markdown-links/local.json` and `online.json`;
CI uploads them as artifacts. Reports and the one-day external response cache
are ignored by Git. A failed command cannot reuse a previous report.

To update lychee, select a released version, update the platform assets and
checksums in `scripts/lychee-release.json`, align the workflow cache key, install,
and run the tests plus both check modes. The pinned artifacts cover macOS ARM64
and Linux x64/ARM64; adding a platform requires its official release checksum.

## 2026-11-16 follow-up

The six private mnemo links now point to bundled/public implementation contracts,
with origin attribution retained as text. The rejected Cloudflare forum URL was
replaced by the current Basin Catalog documentation. A subsequent HTTP(S) scan
completed with zero errors; no broad status-code or repository exclusions were
added. Private-repository names in provenance and optional catalog identifiers
remain identifiers, not claims that a public reader can fetch their contents.
