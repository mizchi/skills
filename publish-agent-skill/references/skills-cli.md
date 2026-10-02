# Verify the npx skills CLI

Record `npx --yes skills@latest --version`, then pin that **CLI version** in reproducible smoke commands. This pin does not pin the installed skill's Git revision. The command examples below use `skills@1.7.0`, the version checked when this guide was written; review current `--help` when adopting a newer version.

## Local consumer

From a fresh consumer directory, with the source skill in a separate directory:

```sh
npx --yes skills@1.7.0 add /absolute/path/to/source --list
npx --yes skills@1.7.0 add /absolute/path/to/source --skill sample-skill --agent claude-code --copy --yes
npx --yes skills@1.7.0 list --agent claude-code --json
```

Replace the skill name. `--skill` selects the frontmatter name, `--agent` constrains the destination and omitting `--global` keeps project scope. `--list` is discovery only. `--copy` exercises delivered files rather than relying on a development link. Also inspect a normal symlink installation if that is the advertised mode. See the [official CLI README](https://github.com/vercel-labs/skills#readme).

Locate the actual directory or canonical symlink target using `list` and the filesystem. Run the verifier on that directory, then confirm fresh-agent discovery and resource use. Local source discovery is not proof of a remote repository/ref working.

## Published consumer

After push, repeat in another clean project:

```sh
npx --yes skills@1.7.0 add mizchi/skills --list
npx --yes skills@1.7.0 add mizchi/skills --skill publish-agent-skill --agent claude-code --copy --yes
npx --yes skills@1.7.0 list --agent claude-code --json
```

Verify the intended source revision. The source parser supports a GitHub tree URL for selecting a ref/subdirectory, such as `https://github.com/owner/repo/tree/<full-sha>/path/to/skill`; use an existing SHA and verify the installation/lock records rather than assuming npm-style `owner/repo#ref` syntax.

## Restore and update

Inspect `skills-lock.json` when the CLI creates it for a project. In a **new consumer with that lockfile**, verify `npx --yes skills@1.7.0 experimental_install` and compare the resulting resources. This command is experimental; retain the CLI version and the exact source/ref in the validation record.

In 1.7.0, restore installs into the universal `.agents/skills/` location; it does not preserve an earlier `--agent claude-code --copy` choice. If Claude Code is the intended consumer, repeat the explicit `add` command in the restored project and verify its destination. The lock's content hash does not freeze a mutable branch: use a full commit ref for reproducible source content. Inspect files even when the restore command exits successfully, since per-source failures can be logged without a nonzero exit.

Use `npx --yes skills@1.7.0 update <skill-name> --project --yes` for a targeted project update; use `--global` only when updating user scope was requested. Version 1.7.0 skips local-path and `node_modules` entries in project `update`; rerun the local `add` command or use the package sync command respectively. A local-only update can print `No installed skills found matching` with exit code zero. Test remote update behavior separately. Older releases documented `skills check`; it is not listed by 1.7.0's help, so do not make it a required step. Refer to [updates.md](updates.md).

The detailed [CLI source guide](https://github.com/vercel-labs/skills/blob/main/AGENTS.md) describes locks, source parsing and update resolution. Treat scope/ref semantics as version-specific and verify them using the installed CLI and actual lock/output.
