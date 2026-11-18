# APM 0.36.0 update validation

Checked on 2026-11-18 with the official macOS arm64 native binary, reporting
`0.36.0 (1759e1e)`. The release archive matched its published SHA-256 sidecar:
`73c06f6d331a80bd91fdeccc99031f9069fd5547136f15c1a212c6d8f1d27ebd`.
The source tag resolves to `1759e1e5d6273a7da8ddd27d5a23312ae9b3df4b`.

## Executed contracts

The tagged upstream suites
[revision-pin update lifecycle](https://github.com/microsoft/apm/blob/v0.36.0/tests/integration/test_revision_pin_update_lifecycle.py)
and [lock consistency](https://github.com/microsoft/apm/blob/v0.36.0/tests/integration/test_revision_pin_lock_consistency_lifecycle.py)
passed all five tests against that native binary. They used owned local Git
repositories, isolated consumers and file-URL rewrites:

- Dry-run proposed the annotated `v2.0.0` release's SHA and preserved manifest
  and lock bytes.
- Applying the plan rewrote the selected SHA in the manifest and lock, recording
  the resolved tag. A second dependency without an eligible release kept its SHA.
- A non-commit annotated tag and malformed remote-tag output failed before
  manifest/lock writes.
- Reinstalling an unchanged revision pin preserved the tag-bearing lock bytes.
- A SHA-pinned manifest selected its own commit over a divergent locked row.

An additional local fixture ran `apm update` with a real PTY and answered `n`.
It exited successfully with `No changes applied`; the manifest, lock and two
deployed instruction files remained byte-identical. A subsequent
`apm install --frozen --target claude` also succeeded and preserved those bytes.

## Reproduce the upstream checks

Use a checkout of the exact tag, an owned temporary test directory outside
all Git/APM projects, and the matching native binary:

```sh
APM_BINARY_PATH=/absolute/path/to/apm \
APM_E2E_TESTS=1 \
uv run --project /absolute/path/to/apm-source --python 3.13 --no-dev \
  --with pytest --with pytest-cov pytest -o addopts= -q \
  --basetemp=/absolute/owned/temporary/test-directory \
  /absolute/path/to/apm-source/tests/integration/test_revision_pin_update_lifecycle.py \
  /absolute/path/to/apm-source/tests/integration/test_revision_pin_lock_consistency_lifecycle.py
```

Python 3.13 ran the test harness; the tested CLI was the native bundle.
The first run placed temporary fixtures inside another Git worktree and passed
four tests while failing fault injection. APM's trusted-executable resolution
excluded that worktree's injected Git shim. Moving the fixtures outside the
worktree made the same five tests pass; the original failure was retained in
local logs rather than suppressed or counted as a pass.

## Scope

These are local revision-update and file-delivery checks. They do not establish
hosted-provider authentication, every deployment target or agent behavior.
The earlier 0.35.1 Claude+Codex skill-delivery check remains a separate dated
baseline. Updating the tested binary does not imply that an existing global
installation or its dependencies were upgraded.

Sources: [update reference](https://microsoft.github.io/apm/reference/cli/update/),
[0.36.0 release](https://github.com/microsoft/apm/releases/tag/v0.36.0),
[installation and ownership](https://microsoft.github.io/apm/getting-started/installation/).
