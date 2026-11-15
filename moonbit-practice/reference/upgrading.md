# Upgrade an older MoonBit project

Use this workflow to move an existing project to the current published MoonBit
toolchain while preserving its public API and behavior. Reviewed on 2026-11-15;
the executable migration example was checked with `moon 0.1.20261104` and
`moonc v0.10.20+65efd5b93`. This records a tested toolchain, not a permanent
definition of "latest".

## 1. Establish the source and target versions

Read the three newest articles on the [official updates index](https://www.moonbitlang.com/updates).
Use [updates.md](updates.md) for the reviewed release baseline. When articles
disagree about the same API/version, the newest applicable article wins. Keep
planned changes and experimental APIs separate from released behavior.

Before changing the toolchain, record:

```bash
moon version --all
command -v moon moonc moonrun
git status --short
```

Record the module dependency versions, supported backends, current API files,
toolchain/CI pins, and the existing test results. Use the old CLI's supported
check/test commands for this baseline; a failing old checkout is not evidence
that the upgrade caused the failure. Preserve uncommitted work and use an
isolated branch or checkout so the migration diff can be reviewed.

## 2. Update the toolchain through its existing installation method

For an installation managed by the official MoonBit CLI:

```bash
moon upgrade
moon version --all
```

Use `moon upgrade --dev` only when the intended target is the development
channel. Check `moon upgrade --help` on the installed CLI; do not invent a
`moon upgrade --version ...` flag. See the
[official upgrade command](https://docs.moonbitlang.com/en/latest/toolchain/moon/commands.html#moon-upgrade).

For an existing Nix/overlay or other managed toolchain, update its pin and lock
through that manager instead. Confirm that `moon`, `moonc`, `moonrun`, and core
belong to the intended toolchain rather than mixing installations on `PATH`.
Retain the project's environment tools; this workflow does not introduce Nix,
devbox, or dotenvx. Record the resolved version for CI and reproducibility.

## 3. Migrate manifests and syntax before type checking

Run the new formatter from the module or workspace root:

```bash
moon fmt
git status --short
git diff
```

On v0.10.19, ordinary build/check commands reject JSON manifests, while the
formatter can still migrate them to `moon.mod` / `moon.pkg`. Preserve the module
name, `source`, import paths, supported targets, and publishing policy. Verify
`preferred_target` explicitly: the default became `wasm` in v0.10.9, which can
change the backend used by an older project.

New DSL files can be untracked while their JSON predecessors appear as deleted;
inspect the new files too, rather than reviewing only the tracked deletion diff.
Inspect the first diff, then run `moon fmt` again if it left newly migrated DSL
or syntax to normalize. The verified JSON migration required two passes:
the first converted `moon.pkg.json` to `options("is-main": true)` in `moon.pkg`,
and the second produced `pkgtype(kind: "executable")`. Do not assume one pass
completes every migration. Finish with:

```bash
moon fmt --check
```

The formatter also migrates supported derive attributes, integer spellings,
trait/impl syntax and extenum declarations. It does not establish semantic
compatibility. See [configuration.md](configuration.md) and [language.md](language.md).

Standalone `.mbtx` files are excluded from an ordinary package-wide format.
Format and check each actual script explicitly, for example
`moon fmt tools/task.mbtx` and `moon check tools/task.mbtx`; use the new `---`
configuration header from [mbtx.md](mbtx.md).

If the latest formatter cannot parse very old source, repair the reported syntax
using the relevant release guidance, or use an available intermediate toolchain
that accepts that syntax to migrate it first. Verify the intermediate version
exists; keep each migration diff reviewable instead of guessing removed syntax.

## 4. Resolve dependency compatibility separately

```bash
moon update
moon tree --json
moon view moonbitlang/async --versions
```

The last command is an example for projects already using that runtime.
`moon update` refreshes registry metadata; it is not a toolchain upgrade or a
promise that every declared dependency has been upgraded. Check/build/test
resolve dependencies automatically; remove uses of `moon install` for syncing
dependencies.

Select published versions compatible with the target compiler and review their
breaking changes. Update the inline versions in `moon.mod` deliberately. When
upgrading an existing dependency to the registry-selected version is intended,
the checked CLI supports `moon add --upgrade owner/module`; inspect its diff.
Inspect dependency failures separately from errors in the project's own source.

An existing external `moonbitlang/async` project can keep that runtime. Read
[async.md](async.md) when upgrading across 0.21.x to 0.22.x. Experimental
`core/async` adoption is a separate decision; coexistence requires external
async 0.22.7 or newer, not simply a new compiler.

## 5. Repair semantic changes in small groups

Start with an explicit backend that the project already supports:

```bash
moon check --target js --no-mbti
```

Replace `js` with the project's backend. `--no-mbti` keeps failed/intermediate
migrations from publishing API files. Use `moon explain <diagnostic-code>` and
`moon ide doc` against the resolved core/dependencies, then re-check after each
coherent repair. Do not suppress diagnostics just to finish the upgrade.

| Old assumption | Repair to verify |
| --- | --- |
| Removed `try?` or special struct `fn new` | Catch into a `Result`; use a type-named constructor. See [language.md](language.md) and the main skill's syntax examples |
| An `impl` or derive automatically attaches dot methods | Declare the intended `extend` / `pub extend`; review public method visibility |
| Core aliases or `Json` / `ToJson` need no package import | Import the referenced core packages; use qualified JSON APIs |
| Black-box tests implicitly see their package's names | Use `@package.symbol`; keep private-access tests in white-box files |
| A MoonBit `Array` can cross a JS boundary by identity | Use `FixedArray`, converting with `FixedArray::from_array(xs[:])`; check nested arrays, spread and Promise results |
| `catch` performs cancellation cleanup | External async 0.22.x cancellation bypasses `catch`; migrate ownership cleanup to `defer` / `errdefer`, checking `nocancel` requirements |
| Invalid slice bounds must fail | Slice syntax now clamps; use `exact_view` when strict checking is the intended contract |
| Package/script/runner configuration is interchangeable | Review `pkgtype`, conditional imports, script headers, `.moonignore`, and Wasm-only `moonx` independently |

For JS/Workers, re-run the consumer's object, numeric, async, and D1 contracts.
Generated runtime-symbol rewrites depend on the compiler and runtime version;
revalidate them against the built bundle rather than blindly copying old names.

## 6. Use `moon fix` only when the selected toolchain supports it

As checked on **2026-11-15**, [PR #2528](https://github.com/moonbitlang/moon/pull/2528)
is Draft and unmerged. The checked CLI has no built-in `fix` command. Its planned
driver applies machine-applicable fixes from compiler JSON diagnostics; updating
only the driver does not supply those compiler diagnostics.

For a future supported release, inspect the selected CLI and compiler:

```bash
moon --help
moon fix --help
```

An unsupported command means this step is skipped; it does not block manual
migration. An external `moon-fix` found on `PATH` is not by itself evidence that
the official driver/compiler combination is available. If the installed,
supported driver advertises `--diff`, preview with `moon fix --diff` and review
the edits before applying `moon fix`. If no fixes are proposed or the diagnostics
stop changing, inspect the remaining failures rather than retrying indefinitely.
Re-check and test every applied fix; automatic edits are not a behavior test.

## 7. Validate behavior, publish interfaces, and align CI

For a JS project, the final gate is:

```bash
moon fmt --check
moon check --target js --deny-warn --no-mbti
moon test --target js --deny-warn
moon build --target js --release --deny-warn
```

Repeat check/test/build for each backend the project claims, using its existing
test tasks where appropriate. Exercise exported JS APIs, command stdin/stdout,
native host linking, or built Worker requests when those are the product contract.
Run required standalone-script checks explicitly. Update snapshots only after
reviewing why the expected behavior changed; do not use `moon test -u` as a
blanket upgrade repair.

Once the code is correct, run `moon check --deny-warn` with the intended
`preferred_target` to refresh `pkg.generated.mbti`, or use explicit `moon info`.
Review the generated API diff. A check of another backend alone may not update
the package's preferred-backend interface.

Align CI and existing toolchain locks with the verified version, then repeat the
project's required CI tasks. Keep the old version and baseline available until
the new gates pass; rollback uses the previous toolchain and dependency pins,
not speculative source rewrites. Report the old/new toolchain versions, changed
dependencies, API/behavior changes, executed checks, and any unverified targets.

## Verification scope of this reference

An isolated legacy project reproduced JSON-manifest rejection, two formatter
passes, `Int` to `Int32`, the executable `pkgtype`, a clean formatting check, and
an executable returning the original value `42`. A `--no-mbti` check left the
interface file absent as intended. The formatting check used standard Git diff
settings rather than the local external diff renderer.

The toolchain-upgrade commands were checked through CLI help; writing this
reference did not upgrade the machine's shared toolchain or exercise the
unreleased `moon fix` driver. The broader language/JS/runtime cases can be run
from this repository with `just --justfile moonbit.justfile test`.
