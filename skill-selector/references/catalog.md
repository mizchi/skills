# Curated skill catalog (Phase 1)

Reference list for `skill-selector` Phase 1. Skills here have been vetted by mizchi for fit and quality. Group by project signal so the matching step is mechanical: detect the signal, propose the matching rows.

If a skill belongs to multiple axes, list it under its primary one.

Install strings are written for global scope (`apm install -g <string>`). For project scope, drop the `-g` and add the same string under `dependencies.apm` in `apm.yml`.

The "Install" column may also be:

- `(out-of-band)` — not installable via public APM (chezmoi-local, internal-only, gated). Mention in prose when relevant; do NOT add to `apm.yml`.
- A row whose description names a specific platform (CI provider, runtime, cloud). When the project's platform differs, the core capability may still apply — read the underlying `SKILL.md` before deciding whether to adopt.
- A subpath that diverges from the `<owner>/<repo>/skills/<name>` convention (e.g., `moonbitlang/moonbit-agent-guide/moonbit-c-binding`). This reflects an upstream layout that does not put skills under `skills/`. Run `apm view <owner>/<repo>` (or open the upstream README) once before committing to confirm the subpath is correct.

---

## Languages / runtimes

### Node.js / TypeScript
**Signals**: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `node_modules/`

| Skill | Install | Use when |
|---|---|---|
| node-sqlite-vec | `mizchi/skills/node-sqlite-vec` | Project uses Node 24+ `node:sqlite` with `sqlite-vec` extension for vectors / RAG |
| pi-coding-agent | `mizchi/skills/pi-coding-agent` | Embedding `@mariozechner/pi-coding-agent` as a coding-agent runtime in Node scripts |
| dotenvx | `mizchi/skills/dotenvx` | Repo uses or considers `dotenvx` for env-var encryption / multi-env |

### MoonBit
**Signals**: `moon.mod.json`, `moon.pkg.json`, `_build/`, `.mooncakes/`

| Skill | Install | Use when |
|---|---|---|
| moonbit-practice | `mizchi/skills/moonbit-practice` | Writing or reviewing MoonBit code (general best practices) |
| moonbit-js-binding | `mizchi/skills/moonbit-js-binding` | MoonBit project needs JS FFI (`extern "js"`) for browser / Node / npm packages |
| moonbit-agent-guide | `moonbitlang/moonbit-agent-guide/moonbit-agent-guide` | First-time MoonBit project setup — moon tooling, layout conventions |
| moonbit-refactoring | `moonbitlang/moonbit-agent-guide/moonbit-refactoring` | Refactoring an existing MoonBit package idiomatically |
| moonbit-c-binding | `moonbitlang/moonbit-agent-guide/moonbit-c-binding` | MoonBit project links a C library via native FFI |
| tuimbt-practice | `mizchi/tui.mbt/skills/tuimbt-practice` | Building terminal UI in MoonBit using `tui.mbt` |

### Gleam
**Signals**: `gleam.toml`, `manifest.toml`, `.gleam_version`

| Skill | Install | Use when |
|---|---|---|
| gleam-practice | `mizchi/skills/gleam-practice` | Building or reviewing Gleam projects on the Erlang target (Wisp + Mist, OTP) |

---

## Tooling / Infra

### Build / task running
**Signals**: `justfile`, `devbox.json`, `flake.nix`, `Taskfile.yml`

| Skill | Install | Use when |
|---|---|---|
| justfile | `mizchi/skills/justfile` | Project uses or considers `just` as task runner |
| devbox | `mizchi/skills/devbox` | Project uses devbox (Nix-based reproducible env) |
| nix-setup | `mizchi/skills/nix-setup` | Bootstrapping Nix flakes (MoonBit / Rust / TypeScript+pnpm / Python+uv) |

### Static analysis / lint
**Signals**: `sgconfig.yml`, ad-hoc lint requirements that ESLint/biome can't express

| Skill | Install | Use when |
|---|---|---|
| ast-grep-practice | `mizchi/skills/ast-grep-practice` | Operating ast-grep as a project lint tool (rules, fix, CI) |
| ast-grep | `ast-grep/agent-skill/ast-grep` | Writing ast-grep rules / structural search (general guide) |

### CI / GitHub Actions
**Signals**: `.github/workflows/`, failing PR checks

| Skill | Install | Use when |
|---|---|---|
| gh-fix-ci | `mizchi/skills/gh-fix-ci` | Debugging or fixing failing GitHub Actions PR checks via `gh` |

### Cloud deployment
**Signals**: `wrangler.toml`, Cloudflare-related configs

| Skill | Install | Use when |
|---|---|---|
| cloudflare-deploy | `mizchi/skills/cloudflare-deploy` | Deploying to Cloudflare Workers / Pages |

### Release / changelog
**Signals**: `CHANGELOG.md`, release-please config, `.changeset/`, version-tag-driven release

| Skill | Install | Use when |
|---|---|---|
| conventional-changelog | `mizchi/skills/conventional-changelog` | Setting up or unifying a release flow with Conventional Commits + auto changelog |
| upstream-fix-and-pin | `mizchi/skills/upstream-fix-and-pin` | A dependency has a bug or missing feature; you need to pin a fork while waiting for upstream merge |
| npm-release | `(out-of-band)` | Setting up npm publishing via release-please + OIDC. chezmoi-local; ask mizchi |

---

## Testing / Browser

**Signals**: `playwright.config.*`, `e2e/`, image-diff requirements

| Skill | Install | Use when |
|---|---|---|
| playwright-test | `mizchi/skills/playwright-test` | **Primary** for any Playwright project. Writing / reviewing E2E tests — no fixed waits, network triggers |
| playwright-cli | `mizchi/skills/playwright-cli` | **Secondary** — add only when CI sharding, codegen, or one-off `screenshot/pdf` matters. Skip when test authoring is the only concern |
| review-image | `mizchi/skills/review-image` | Reviewing screenshots / generated images via OpenRouter vision models, VRT prechecks |

---

## Reliability / Flakiness

| Skill | Install | Use when |
|---|---|---|
| flaker-setup | `mizchi/flaker/skills/flaker-setup` | Introducing `@mizchi/flaker` to a repo for flaky-test detection / GitHub Actions integration |

---

## Process / Meta

### Skill / prompt authoring

| Skill | Install | Use when |
|---|---|---|
| apm-usage | `mizchi/skills/apm-usage` | Adding / removing / updating skills via APM (always pair with `skill-selector`) |
| empirical-prompt-tuning | `mizchi/skills/empirical-prompt-tuning` | Iteratively improving an agent-facing instruction via subagent execution |
| retrospective-codify | `mizchi/skills/retrospective-codify` | Converting trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules |

### Personal / dotfiles

| Skill | Install | Use when |
|---|---|---|
| chezmoi-management | `mizchi/skills/chezmoi-management` | Touching mizchi's chezmoi-managed dotfiles (`~/.claude/`, `~/.config/`, `~/.zshrc`) |

### Writing / publishing

| Skill | Install | Use when |
|---|---|---|
| mizchi-blog-style | `mizchi/skills/mizchi-blog-style` | Drafting a blog post to be published as mizchi (zenn / dev.to). Style + AI-smell detection |
| tech-article-reproducibility | `mizchi/skills/tech-article-reproducibility` | Final reproducibility check on a tech article draft before publication |

### Migration / porting

| Skill | Install | Use when |
|---|---|---|
| translate-programming-language | `mizchi/skills/translate-programming-language` | Porting modules / services / APIs between programming languages with behavior parity |

---

## Deliberately not in catalog

Some axes have no catalog row by design. Do **not** escalate to Phase 2 for these — they are one-off setup tasks, not recurring skill-shaped needs. Solve inline with framework docs.

| Axis | Reason no skill |
|---|---|
| Vite / React / Next.js / Solid frontend scaffolding | One-off setup; framework docs are sufficient. Recurring patterns (E2E, build, CI) are covered by other catalog rows. |
| Single-shot config conversions (e.g., webpack → Vite, Jest → Vitest) | One-off migration; AI-aided porting handles this inline. |
| Ad-hoc data migrations / one-time backfills | One-off; doesn't recur. |
| ORMs / DB clients in general | Too project-specific; only listed when a concrete operational pain has been encoded (e.g., `node-sqlite-vec`). |

If you find yourself wanting a skill on one of these axes, that's a Phase 2 escalation candidate — but verify the need is recurring across multiple sessions before searching.

## Catalog hygiene

- A row here means: someone has actually used this skill on a real project and it pulled its weight.
- When a new skill enters `mizchi/skills` (or an upstream repo this catalog references), add a row only after the first real use in a project.
- When a skill is removed or deprecated, drop the row in the same edit.
- If you find yourself frequently citing a Phase-2 result, that's the trigger to promote it: open a PR adding it to this file with the project signal that triggered the match.
