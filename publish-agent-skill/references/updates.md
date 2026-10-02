# Publish and receive updates

## Author release

Update the portable skill and its resources together, regenerate install documentation, run relevant checks, mirror local development copies where repository instructions require it and commit/push within the user's authorization. If maintaining a packaged plugin copy, regenerate it from the same source before releasing; do not leave its resources behind.

For a versioned release, choose a semantic version consistent with the repository's convention and publish a real Git tag at the reviewed commit. Git tags serve APM/source refs; Claude plugin `version` controls cached plugin replacement. Keep a plugin's explicit version in one authoritative location: standalone `plugin.json`, or the entry for a manifestless marketplace plugin.

[Claude release rules](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version): bump the plugin's explicit version when shipping changes; pushing new commits with the same explicit version can leave consumers on the cached copy. An alternative is to omit version in both manifest and entry so the computed version follows commits. Local directory sources load in place, so their successful reload does not verify hosted cache updates.

Publish tags/releases and change repository visibility only within the requested scope. A documentation-only skill addition does not require an invented release/tag convention or submission to a public plugin directory.

## Consumer commands

| Channel            | Targeted update                                                                                                     | Verify                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Claude marketplace | `claude plugin marketplace update <marketplace>` then `claude plugin update <plugin>@<marketplace> --scope project` | Plugin version/install path, `plugin details`, resource contents, then new session or `/reload-plugins`. |
| APM project        | `apm update <owner/repo/path> --dry-run` then `apm update <owner/repo/path> --yes`                                  | Manifest/ref, changed lockfile, deployed files, `apm install --frozen`.                                  |
| APM global         | Same requested package with `apm update -g <owner/repo/path> --yes`                                                 | User manifest/lock and the actual deployed user skill path.                                              |
| skills CLI project | `npx --yes skills@1.7.0 update <skill-name> --project --yes`                                                        | Project lock/output, actual installed files and new-agent discovery.                                     |
| skills CLI global  | `npx --yes skills@1.7.0 update <skill-name> --global --yes`                                                         | Global install records/files and new-agent discovery.                                                    |

An update without an explicit package can update unrelated skills; target the requested package and scope. Check command support with local help, including scope flags. For APM, [dependency update](https://microsoft.github.io/apm/reference/cli/update/) differs from upgrading the APM tool itself (`apm self-update`, or the owning package manager).

Pinned immutable refs remain pinned. To move an APM consumer from `#v0.1.0` to `#v0.2.0`, update its dependency declaration and intentionally regenerate the lock, then verify frozen replay. Do not overwrite the old tag. For rollback, reinstall the known good source/ref and verify its contents; bump a Claude plugin release version if rolling its contents back, so hosted consumers receive the rollback.

## Diagnose a stale update

Compare the source commit/ref, plugin computed version, consumer lock and installed content. Check that the correct marketplace and scope were updated, the catalog points to the intended plugin source, and the agent was reloaded. Distinguish an in-place local plugin from a hosted cached copy and a symlink from an independent copy.

Avoid deleting broad global caches to fix one skill. First reinstall or update the specific package using supported CLI commands. If a CLI reports a no-op, inspect pins and versions rather than claiming the newest content was installed. Record unresolved failures and the evidence needed to diagnose them.

## Validation record

Record date, CLI versions, source/ref, channel/scope, resolved installation path, discovery output, resource verifier result, restore/update outcome and the representative agent task tested. Clearly separate metadata/file-delivery checks from a real agent behavioral check. Include the exact failing command and outcome when a channel was not verified.
