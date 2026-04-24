{
  description = "Haskell development environment (GHC + cabal + HLS)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        apm = import ./apm.nix { inherit pkgs; };

        # Pick a specific GHC if you care about reproducibility.
        # `pkgs.haskellPackages` tracks whatever GHC the nixpkgs branch ships
        # as default (today usually GHC 9.6 / 9.8). To pin:
        #   haskellPackages = pkgs.haskell.packages.ghc98;
        haskellPackages = pkgs.haskellPackages;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            haskellPackages.ghc
            haskellPackages.cabal-install
            haskellPackages.haskell-language-server
            haskellPackages.hlint
            haskellPackages.ormolu       # formatter (fourmolu is an alternative)
            haskellPackages.ghcid        # fast feedback loop

            # Common tooling (included in every template)
            pkgs.just
            pkgs.ast-grep
            apm

            # Uncomment if you build against system C libraries frequently
            # pkgs.pkg-config
            # pkgs.zlib
          ];

          # `cabal` sometimes caches things under $HOME/.cabal; fine to keep
          # default. If you want project-local, set CABAL_DIR / CABAL_CONFIG.
        };
      });
}
