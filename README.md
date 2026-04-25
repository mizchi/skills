# mizchi/skills

A collection of agent skills maintained by [@mizchi](https://github.com/mizchi), distributed via [APM](https://github.com/apm-sh/apm) (Agent Package Manager).

Each directory is a standalone skill following the [agentskills.io](https://agentskills.io/specification) open standard.

## Install

Install an individual skill (global / user scope):

```sh
apm install -g mizchi/skills/<skill-name>
```

Or add to a project's `apm.yml`:

```yaml
dependencies:
  apm:
    - mizchi/skills/<skill-name>
```

Pin to a tag:

```sh
apm install -g mizchi/skills/<skill-name>#v0.1.0
```

## Skills

### Tooling / Infra

| Skill | Description |
| --- | --- |
| [apm-usage](apm-usage/) | Use APM (Agent Package Manager) to manage agent skills and dependencies. |
| [ast-grep-practice](ast-grep-practice/) | Run ast-grep as a project lint tool — `sgconfig.yml`, fix/rewrite rules, constraints, CI. |
| [chezmoi-management](chezmoi-management/) | mizchi's personal chezmoi dotfiles workflow (diff/apply, skill placement, APM vs chezmoi boundary). |
| [cloudflare-deploy](cloudflare-deploy/) | Deploy applications to Cloudflare Workers / Pages and related platform services. |
| [conventional-changelog](conventional-changelog/) | Conventional Commits + CHANGELOG generator comparison (release-please, changesets, git-cliff, towncrier). |
| [devbox](devbox/) | Nix-based devbox reference with GitHub Actions examples. |
| [dotenvx](dotenvx/) | dotenvx env-var management reference (encryption, multi-env, CI). |
| [justfile](justfile/) | `just` command runner reference with GitHub Actions examples. |
| [nix-setup](nix-setup/) | Bootstrap Nix flakes for MoonBit / Rust / TypeScript / Python projects. |
| [gh-fix-ci](gh-fix-ci/) | Debug and fix failing GitHub Actions PR checks via `gh`. |
| [node-sqlite-vec](node-sqlite-vec/) | Combine Node 24+ `node:sqlite` with the `sqlite-vec` extension — extension load, vec0 BigInt rowids, why vitest fails, CLI shebang. |

### Testing / Browser

| Skill | Description |
| --- | --- |
| [playwright-cli](playwright-cli/) | Run Playwright via terminal CLI (test runner, codegen, screenshot, CI sharding). |
| [playwright-test](playwright-test/) | Playwright Test (E2E) best practices — no fixed waits, network triggers, DnD, CI sharding/retry. |

### MoonBit

| Skill | Description |
| --- | --- |
| [moonbit-practice](moonbit-practice/) | MoonBit code generation best practices — syntax, tests, benchmarks, FFI, Nix, mbtx. |
| [moonbit-js-binding](moonbit-js-binding/) | Write MoonBit bindings to JavaScript with `extern "js"` (Promises, opaque types, esm/cjs/iife). |

### Languages

| Skill | Description |
| --- | --- |
| [gleam-practice](gleam-practice/) | Build and review Gleam projects on the Erlang target (Wisp + Mist, OTP, just, CI). |

### Process / Meta

| Skill | Description |
| --- | --- |
| [empirical-prompt-tuning](empirical-prompt-tuning/) | Iteratively evaluate and improve agent-facing text instructions using unbiased subagent executors. |
| [retrospective-codify](retrospective-codify/) | Convert trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules. |
| [mizchi-blog-style](mizchi-blog-style/) | Style guide and AI-smell detection for blog posts published as mizchi (zenn / dev.to). |
| [tech-article-reproducibility](tech-article-reproducibility/) | Simulate a first-time reader reproducing a technical article and list missing information. |

## Language

All `SKILL.md` files are written in English. Skills that were originally written in Japanese preserve the original as `SKILL-ja.md` alongside the English version. `mizchi-blog-style` is the single exception and stays Japanese-only because the skill itself is about Japanese blog writing style.

## Upstream skills (not in this repo)

These are maintained in their own repositories and installed separately:

- [mizchi/flaker](https://github.com/mizchi/flaker) — `flaker-setup`
- [mizchi/tui.mbt](https://github.com/mizchi/tui.mbt) — `tuimbt-practice`
- [moonbitlang/moonbit-agent-guide](https://github.com/moonbitlang/moonbit-agent-guide) — `moonbit-agent-guide`, `moonbit-refactoring`, `moonbit-c-binding`
- [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) — `ast-grep`

## License

Each skill may carry its own license (see `LICENSE.txt` inside the skill directory). Skills without an explicit license default to MIT at the repository owner's discretion.
