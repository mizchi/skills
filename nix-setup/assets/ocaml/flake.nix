{
  description = "OCaml development environment (OCaml 5 + dune + LSP, project-local opam)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        apm = import ./apm.nix { inherit pkgs; };

        # Pick an OCaml version. `pkgs.ocamlPackages` tracks the nixpkgs
        # default (today OCaml 5.x). For a specific version:
        #   ocamlPackages = pkgs.ocaml-ng.ocamlPackages_5_2;
        ocamlPackages = pkgs.ocamlPackages;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with ocamlPackages; [
            ocaml
            dune_3
            findlib             # ocamlfind
            merlin              # editor support (used by ocaml-lsp)
            ocaml-lsp           # language server
            ocamlformat         # formatter
            utop                # REPL
          ] ++ [
            # opam is still useful for pulling libraries nixpkgs doesn't ship.
            # State is kept inside the project (see shellHook), not $HOME.
            pkgs.opam

            # Common tooling (included in every template)
            pkgs.just
            pkgs.ast-grep
            apm
          ];

          shellHook = ''
            # --- Project-local opam state -------------------------------------
            # Keep $OPAMROOT under $PWD so each project has its own switch and
            # the global ~/.opam is untouched. Mirrors the python-uv template
            # pattern (UV_PROJECT_ENVIRONMENT=$PWD/.venv).
            export OPAMROOT="$PWD/.opam"

            # First-time bootstrap. `--disable-sandboxing` is required on macOS
            # because opam's own sandbox clashes with Apple's; the outer Nix
            # shell already provides isolation.
            if [ ! -f "$OPAMROOT/config" ]; then
              echo "[nix-shell] Initializing opam in $OPAMROOT (first-time setup)..."
              opam init --bare --no-setup --yes --disable-sandboxing >&2

              # Empty switch: no opam-managed ocaml, we use the nix-provided one.
              # Libraries installed via `opam install` land here.
              opam switch create default --empty --yes >&2
            fi

            # Make `opam` commands target the project switch automatically.
            eval "$(opam env --switch=default --set-switch 2>/dev/null || true)"
          '';
        };
      });
}
