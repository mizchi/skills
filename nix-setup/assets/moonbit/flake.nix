{
  description = "MoonBit development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # Toolchain snapshot checked on 2026-11-16. Keep flake.lock and verify
    # the compiler plus current host support before changing this revision.
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay/a0e830b32d60bcc59d18853e39e0b3fa5081f033";
  };

  outputs = { self, nixpkgs, flake-utils, moonbit-overlay }:
    flake-utils.lib.eachSystem [ "aarch64-darwin" "x86_64-linux" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        apm = import ./apm.nix { inherit pkgs; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            # MoonBit toolchain (moon, moonc, moonrun, mooncake).
            # Current release aliases are the original identifiers, e.g.
            # "v0.10.20+65efd5b93+940aa18". Lock the input for reproducibility.
            moonbit-overlay.packages.${system}.latest

            # Common tooling (included in every template)
            pkgs.just
            pkgs.ast-grep
            apm
          ];


        };
      });
}
