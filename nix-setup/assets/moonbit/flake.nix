{
  description = "MoonBit development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # moonbit-overlay is pinned to a known-working rev.
    # The overlay HEAD sometimes depends on nixpkgs packages that have been
    # marked broken (e.g. tcc) in nixpkgs-unstable. Bump this rev deliberately.
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay/50118f5c3c0298b5cb17cc6f1c346165801014c8";
  };

  outputs = { self, nixpkgs, flake-utils, moonbit-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        apm = import ./apm.nix { inherit pkgs; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            # MoonBit toolchain (moon, moonc, moonrun, mooncake).
            # This overlay exposes versioned aliases too:
            #   moon-patched_v0_6_27-5aa3a5173, moonbit_v0_9_0-9f1423bcb-c9ac7ee, ...
            moonbit-overlay.packages.${system}.moon-patched_latest

            # Common tooling (included in every template)
            pkgs.just
            pkgs.ast-grep
            apm
          ];

          shellHook = ''
            # First-time setup: fetch mooncake registry
            if [ -f moon.mod.json ] && [ ! -d .mooncakes ]; then
              moon update 2>/dev/null || true
            fi
          '';
        };
      });
}
