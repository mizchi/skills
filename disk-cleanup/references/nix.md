# Nix GC, generations, and identical files

Use installed Nix help to select modern or legacy commands. `nix gc` is not the
command: use `nix store gc` or `nix-store --gc`. Do not enable experimental features
globally just for cleanup if the legacy commands suffice.

## Inspect first

```sh
nix --version
nix-store --gc --print-roots
nix-store --gc --print-dead
```

Root/dead-path enumeration can be substantial; save a bounded summary instead of
dumping the entire store into the conversation. For a selected profile:

```sh
nix profile list --profile "$profile"
nix profile history --profile "$profile"
```

For a legacy `nix-env` profile, use `nix-env --profile "$profile"
--list-generations`. Identify the user profile, Home Manager profile, and any
NixOS/nix-darwin system profile separately. Running GC as one user does not mean
all other profiles' history has expired.

GC deletes paths unreachable from roots. A currently selected old package stays
live; repeatedly running GC will not upgrade it. Find the profile, `result` link,
direnv environment, or other root retaining the closure. Remove only obsolete
roots whose owners and recovery path are understood. Never delete `/nix/store`
entries manually, bypass liveness checks, or unlink a running system's roots.

## Recover headroom without expiring profiles

GC has no inactivity-age filter. An unrooted path is not necessarily 30 days old.
If the request strictly limits deletion by age, report the preview and keep that
scope unless ordinary all-age Nix GC is also authorized. An explicit request for
normal Nix GC already supplies that scope; do not ask for it again.

```sh
nix store gc --dry-run
nix store gc
```

Legacy alternatives are `nix-store --gc --print-dead` and `nix-store --gc`.
This reclaims unreachable paths while retaining profile generations and their
rollback roots. It can still evict unrooted development builds that need rebuilding.
See the [GC command](https://nix.dev/manual/nix/2.34/command-ref/new-cli/nix3-store-gc.html).

## Update and activate before retiring old versions

When updates are within scope:

1. Identify the environment's owner: standalone `nix profile`, a Home Manager /
   nix-darwin / NixOS configuration, or a project flake. Reuse that configuration's
   documented update and switch task.
2. Align selected packages on compatible locked inputs where that removes an
   accidental second nixpkgs/toolchain closure. Update only selected lock inputs;
   do not rewrite every repository's `flake.lock` or remove intentional pins.
3. Build and activate the replacement, check the selected tool versions and
   relevant environment smoke checks, and identify a known-good rollback generation.
4. Retire the planned old generations, then collect garbage and optimise.

For an imperative profile, inspect `nix profile upgrade --help` and upgrade only
the selected entries. A declarative environment must be updated in its source
configuration, not by installing a competing imperative copy. Different
derivations can legitimately require multiple versions; do not force incompatible
projects onto one version just to reduce store size.

## Expire profile history deliberately

List the selected profile's history and record current/rollback generations
before removing any. For a modern profile, an explicit age limit is:

```sh
nix profile wipe-history --profile "$profile" --older-than 30d
nix store gc
```

The age limit applies to non-current generations, and removed generations cannot
be rolled back to. If it would remove a rollback generation the user wants to
retain, choose a longer retention period or the owner's generation-selection
mechanism instead. Bare `wipe-history` removes all non-current generations.
See [profile history removal](https://nix.dev/manual/nix/2.34/command-ref/new-cli/nix3-profile-wipe-history.html).

For a legacy profile, `nix-env --profile "$profile" --delete-generations ID ...`
can remove explicitly selected generations while keeping chosen rollback IDs.
Do not assume one profile command covers an independently managed Home Manager
or system profile; inspect that owner's generation-management command.

For an explicitly authorized multi-profile cleanup, the combined legacy command
is `nix-collect-garbage --delete-older-than 30d`. It searches multiple profile
locations and can affect other users when run with sufficient privileges.
Prefer targeted profile expiration. Never use `sudo nix-collect-garbage -d` as a
routine default. Do not present a combined generation-deletion command as a
harmless GC preview; preview currently dead paths separately and review the
generation list. See [nix-collect-garbage](https://nix.dev/manual/nix/2.34/command-ref/nix-collect-garbage.html).

## Optimise after GC

```sh
nix store optimise
```

Legacy alternative: `nix-store --optimise`.

This replaces identical regular files with hard links. It does not remove
reachable generations, upgrade software, or merge different package versions.
Running it after GC avoids scanning garbage about to be discarded. Large stores
can take time; allow the operation its own budget rather than rerunning scans.
See [store optimisation](https://nix.dev/manual/nix/2.34/command-ref/new-cli/nix3-store-optimise.html).

For requested recurring maintenance, configure the existing NixOS/nix-darwin
GC and optimisation facilities or `auto-optimise-store` in the owning Nix
configuration. Preserve the chosen retention policy; do not install a second
overlapping timer or modify global configuration during a one-off cleanup.
