{
  description = "Python + uv development environment";

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
          packages = [
            # uv manages Python versions itself via `uv python install`,
            # but having a nix-provided interpreter available avoids a
            # first-run download. Swap to `python312` etc. if you want
            # to pin the system-level fallback.
            pkgs.python3
            pkgs.uv

            # Common tooling (included in every template)
            pkgs.just
            pkgs.ast-grep
            apm
          ];

          shellHook = ''
            # Project-local venv (not $HOME)
            export UV_PROJECT_ENVIRONMENT="$PWD/.venv"
            export UV_CACHE_DIR="$PWD/.uv-cache"
          '';
        };
      });
}
