{
  description = "OxCaml (Jane Street's OCaml fork) development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        apm = import ./apm.nix { inherit pkgs; };
      in
      {
        devShells.default = pkgs.mkShell {
          # OxCaml is not in nixpkgs; it's built from source via opam following
          # the upstream flow (github.com/oxcaml/oxcaml). Nix provides opam and
          # the native build toolchain; opam drives everything else inside a
          # project-local switch ($PWD/.opam).
          packages = with pkgs; [
            opam

            # Build tools for compiling oxcaml from source
            autoconf
            automake
            m4
            pkg-config
            gmp           # zarith dependency
            libffi

            # Common tooling (included in every template)
            just
            ast-grep
            apm
          ];

          shellHook = ''
            export OPAMROOT="$PWD/.opam"
            SWITCH="oxcaml-dev"

            # First-time bootstrap: create the switch, pin oxcaml, set invariant.
            # Actual compilation is NOT run here — it takes 5-20 min and pulls
            # ~1 GB. Users run `opam install` themselves on demand.
            if [ ! -f "$OPAMROOT/config" ]; then
              echo "[nix-shell] Initializing opam in $OPAMROOT ..."
              opam init --bare --no-setup --yes --disable-sandboxing >&2
              opam switch create "$SWITCH" --empty --yes >&2

              # Switch must be active for pin/set-invariant to target it.
              eval "$(opam env --switch=$SWITCH --set-switch)"

              echo "[nix-shell] Pinning oxcaml from github.com/oxcaml/oxcaml ..."
              opam pin add -ny git+https://github.com/oxcaml/oxcaml >&2
              opam switch set-invariant -y --packages oxcaml-dev >&2

              cat >&2 <<'MSG'

[nix-shell] oxcaml switch is ready but NOT built yet.
            To finish setup (5-20 min first run):

              opam install oxcaml-dev
              opam install dune merlin ocaml-lsp-server ocamlformat utop

            Subsequent shell entries will be fast (only opam env is set).
MSG
            fi

            eval "$(opam env --switch=$SWITCH --set-switch 2>/dev/null || true)"
          '';
        };
      });
}
