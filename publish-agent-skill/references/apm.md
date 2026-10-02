# Verify APM installation

Use the [APM install reference](https://microsoft.github.io/apm/reference/cli/install/) and the installed CLI's help. A portable `SKILL.md` directory needs no npm publication or separate skill manifest. Explicit consumer targets make the test independent of marker directories.

## Local consumer

Use sibling `source/sample-skill/` and `apm-consumer/` directories. Copy [apm.yml](../assets/apm.yml) into the consumer, changing the dependency to the source skill being tested. Run inside that consumer:

```sh
apm --version
apm install --help
apm install --dry-run
apm install
apm deps list
apm install --frozen
apm audit
```

`--dry-run` is a preview; the real install is necessary to verify delivery. Record the actual deployed directory reported by APM: names may include a repository/package prefix, and targets can use different skill directories. Read the installed `SKILL.md`, verify its bundled resources against the source, then check discovery in a fresh agent session.

Commit a consumer project's `apm.yml` and `apm.lock.yaml` when they are part of the requested deliverable. `--frozen` requires a matching existing lockfile; it is not a first-install command. `apm audit` supplies integrity/security evidence, not a behavioral evaluation of the skill.

## Published consumer

After the source/ref is pushed, start another clean directory. Declare the remote dependency rather than retaining the local-path smoke manifest:

```yaml
name: skill-remote-smoke
version: 0.1.0
targets:
  - claude
dependencies:
  apm:
    - mizchi/skills/publish-agent-skill
```

Run the local consumer checks against this manifest and compare installed resources to a checkout of the resolved commit. For reproducibility, use `owner/repo/path#<tag-or-full-sha>` and inspect the lockfile's resolved source. Replace placeholder refs with real pushed tags/SHAs.

To install a single skill directly:

```sh
apm install mizchi/skills/publish-agent-skill --target claude
```

The command writes the consumer manifest and installs the package. For an existing user's explicitly requested global installation, `apm install -g mizchi/skills/publish-agent-skill --target claude` uses user scope; do not use that as the default publishing smoke test.

## Current command names

Check `apm update --help` and `apm install --help` on adoption. The verified modern commands are `apm update` for dependency updates and `apm install --frozen` for lockfile replay. Do not copy obsolete `--frozen-lockfile` examples from Node package managers. `apm install --update` is a compatibility path; ordinary install replays a lock and does not guarantee a mutable ref was refreshed. See [APM update](https://microsoft.github.io/apm/reference/cli/update/) and [updates.md](updates.md).
