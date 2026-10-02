# Claude Code marketplace and plugin

A marketplace is a catalog of plugins. A plugin packages skills and optional components; installing it gives its skills a plugin prefix. Start with [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces) and [Create a plugin](https://code.claude.com/docs/en/plugins/create).

## Standalone package

Stage the portable source into this structure, copying all its runtime resources into the skill directory:

```text
marketplace/
  .claude-plugin/marketplace.json
  plugins/sample-skill/
    .claude-plugin/plugin.json
    skills/sample-skill/
      SKILL.md
      references/
      scripts/
      assets/
```

Use the supplied [marketplace.json](../assets/marketplace.json) and [plugin.json](../assets/plugin.json), replacing sample names and author. Marketplace `source` is relative to the marketplace root; plugin component paths are relative to the plugin root. Components live outside `.claude-plugin/`. Keep the entry and manifest names equal and define the plugin `version` only in `plugin.json` for this layout. See the [manifest reference](https://code.claude.com/docs/en/plugins-reference).

An explicit `skills: ["./skills/sample-skill"]` prevents ambiguity about which skill is packaged. Keep required resources inside the package. Validate the complete staged artifact, not only the source skill.

## Existing flat repositories

For a repository such as `mizchi/skills`, preserve `<name>/SKILL.md`. Copy [marketplace-flat.json](../assets/marketplace-flat.json) to the **repository root's** `.claude-plugin/marketplace.json`, replace `sample-skill` with the selected skill and use its existing folder in `skills`. Do this only when adding a live marketplace is requested; providing the template needs no live catalog change.

This example uses `source: "./"`, an explicit skill subdirectory and `strict: false`, with **no root `plugin.json`**. The marketplace entry is the manifest. Add a separate entry with an explicit skill path for each plugin you intend to expose; do not accidentally scan every sibling directory.

Current [strict-mode rules](https://code.claude.com/docs/en/plugins/marketplace-reference#strict-mode): without `plugin.json`, the entry is the manifest regardless of `strict`. With `plugin.json`, `strict: false` plus entry component fields causes a manifest conflict. `strict` is not a generic validation bypass. Default `skills/` scanning and marketplace-root selection differ, so inspect the loaded inventory.

## Validate, install, discover

From a fresh consumer directory with the staged marketplace elsewhere:

```sh
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
claude --version
claude plugin validate /absolute/path/to/marketplace --strict
claude plugin marketplace add /absolute/path/to/marketplace
claude plugin install sample-skill@sample-skills-marketplace --scope project
claude plugin list --json
claude plugin details sample-skill
```

The temporary configuration isolates plugin state as documented in [Claude settings](https://code.claude.com/docs/en/settings). Check that the expected skill appears in `details`, locate its actual loaded directory and run the file verifier. Then start an authenticated fresh Claude session with that same configuration and invoke `/sample-skill:sample-skill`. A scratch configuration will not inherit the normal configuration's login. Do not launch paid model evaluations merely to confirm an install.

`claude plugin validate` checks manifests, but a nonexistent source path can pass validation and fail installation. The [plugin CLI reference](https://code.claude.com/docs/en/plugins/cli-reference) documents scope, JSON output and exit codes; check local `--help` for the installed version. For temporary direct development, `claude --plugin-dir /path/to/plugin` loads that directory without publishing a catalog.

## Host and release

Commit the complete marketplace and plugin artifact to the authorized Git host. Consumer shell commands are:

```sh
claude plugin marketplace add owner/repository
claude plugin install sample-skill@sample-skills-marketplace --scope project
```

The marketplace ID is its JSON `name`, not the GitHub repository name. For relative `source` paths, distribute the marketplace as a Git repository; a raw `marketplace.json` URL supplies only the catalog. Submit to Anthropic's directory only if requested. See [Host and maintain a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace) and [updates.md](updates.md).
