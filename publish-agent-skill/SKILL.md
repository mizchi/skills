---
name: publish-agent-skill
description: Package, publish, verify and update an agent skill through a Claude Code plugin marketplace, APM or the npx skills CLI. Use when preparing skill distribution or diagnosing installation, missing resources and stale updates.
---

# Publish an agent skill

Keep one portable skill directory as the source of truth, then verify each requested distribution channel from a consumer's environment. Publishing means both discoverable metadata and an install that delivers the instructions and resources at the intended revision.

## Choose the channel

| Requested work                      | Read                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Claude Code plugin / marketplace    | [claude-marketplace.md](references/claude-marketplace.md): packaging, catalog, validation, install and component discovery. |
| APM installation                    | [apm.md](references/apm.md): explicit targets, local/remote smoke tests, lockfiles and audit.                               |
| `npx skills` installation           | [skills-cli.md](references/skills-cli.md): discovery, agent selection, copy/symlink installs and restore.                   |
| A new release or stale installation | [updates.md](references/updates.md): author releases, consumer updates, cache/version and pins.                             |

Use only the requested channels. Existing `mizchi/skills/<name>/SKILL.md` folders already fit portable distribution; do not move them into a plugin-only layout. A reusable Claude marketplace template does not itself mean the user wants a live marketplace added to their settings.

## Prepare the source

1. Check repository instructions, license, chosen public/private visibility, current install examples and any plugin/APM manifests. Keep identifiers stable: skill `name` equals its folder name; the marketplace entry and plugin manifest use the same plugin name.
2. Make the skill self-contained. Ship referenced `references/`, `scripts/`, `assets/` and optional `agents/` alongside `SKILL.md`; local absolute paths and sibling skill references do not survive a subdirectory install. Declare actual external dependencies rather than silently assuming they were installed.
3. Validate frontmatter against the [Agent Skills specification](https://agentskills.io/specification), execute relevant helper tests and exercise a realistic request. An installer exit code alone does not establish that the agent loaded the skill or followed its instructions.

In `mizchi/skills`, write the canonical `SKILL.md` in English, add the root README catalog entry and generate the per-skill README. The generator only sees Git-tracked skills: stage the new `SKILL.md`, then run `ruby scripts/gen-skill-readme.rb`. Run `pkf run test` and the skill's own checks. Mirror edited skill files to `~/.claude/skills/<name>/` per the repository's `CLAUDE.md`; that mirror is a convenience, not proof of a consumer install.

## Verify distribution

Use separate temporary consumer directories for Claude, APM and `skills` so one installation cannot conceal another channel's missing files. Keep normal global settings intact. For Claude plugin testing, point `CLAUDE_CONFIG_DIR` at a scratch directory; for APM/skills use project scope and explicit target/agent options.

Capture tool versions and verify three distinct layers:

| Layer                | Evidence                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata / discovery | Manifest validator and the expected skill/plugin listed by the CLI.                                                                   |
| Delivery             | The intended revision's `SKILL.md` and resources are present, readable and match the source.                                          |
| Behavior             | In a fresh agent session, invoke the installed skill by its actual name and exercise a representative task/resource. Record what ran. |

Use [verify-installed-skill.mjs](scripts/verify-installed-skill.mjs) after locating the **actual** installed skill directory:

```sh
node /path/to/publish-agent-skill/scripts/verify-installed-skill.mjs /path/to/source-skill /path/to/installed-skill
```

This read-only helper checks byte equality for `SKILL.md` and the standard runtime resource directories; it supports an installed directory symlink and ignores installer metadata, README and source tests. A mismatch needs investigation: wrong source/ref, missing files, stale cache or an intentional installer transformation. Do not report a match if the installer rewrote the content. It does not validate plugin hooks/MCP or prove agent behavior.

Before a new skill is remotely available, test a local source or staging artifact. After the authorized commit/push or release, repeat installation by the advertised remote source in a clean consumer directory. Local tests cannot prove a published GitHub path, tag or marketplace source exists. Keep failures visible and fix them before reporting distribution complete; avoid repeatedly retrying unchanged commands against the same failure.

## Update without losing provenance

Follow [updates.md](references/updates.md). State which channel and scope were updated, the old/new revision or plugin version and whether a reload/new session is needed. A Git commit, plugin `version`, Git tag and consumer lockfile have different purposes; changing one does not guarantee all consumers received the release.

Keep publishing within the user's requested scope. Prepare and test the artifact before any required approval; explicit authorization to publish already covers the requested publication. Do not infer authority to change repository visibility, submit to Anthropic's directory, register global marketplaces or update every unrelated installed skill.

## Templates

- [plugin.json](assets/plugin.json): standalone `.claude-plugin/plugin.json` inside a plugin root.
- [marketplace.json](assets/marketplace.json): catalog at `.claude-plugin/marketplace.json`, listing that plugin under `plugins/<name>/`.
- [marketplace-flat.json](assets/marketplace-flat.json): alternative catalog selecting one existing sibling skill directory from a flat repository; no root `plugin.json`.
- [apm.yml](assets/apm.yml): local smoke consumer with `targets: [claude]`; replace the sample dependency path or use a remote ref.

Replace sample names, author and paths consistently, then run the actual consumer CLI. JSON parsing alone misses absent plugin source directories and runtime discovery errors.
