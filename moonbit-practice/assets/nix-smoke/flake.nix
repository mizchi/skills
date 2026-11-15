{
  description = "MoonBit DSL project build smoke check";
  inputs = {
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay/a0e830b32d60bcc59d18853e39e0b3fa5081f033";
    nixpkgs.follows = "moonbit-overlay/nixpkgs";
  };
  outputs = { self, nixpkgs, moonbit-overlay }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" ];
      perSystem = nixpkgs.lib.genAttrs systems;
      appFor = system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          toolchain = moonbit-overlay.packages.${system}.latest;
        in pkgs.stdenv.mkDerivation {
          pname = "moonbit-dsl-smoke";
          version = "0.1.0";
          src = ./.;
          nativeBuildInputs = [ toolchain ];
          buildPhase = "moon build --target native --release --deny-warn";
          installPhase = ''
            mkdir -p "$out/bin"
            install -m755 _build/native/release/build/nix_smoke.exe "$out/bin/nix_smoke"
          '';
        };
    in {
      packages = perSystem (system: { default = appFor system; });
      checks = perSystem (system: {
        output = nixpkgs.legacyPackages.${system}.runCommand "moonbit-output-check" {} ''
          test "$(${appFor system}/bin/nix_smoke)" = "42"
          touch "$out"
        '';
      });
      devShells = perSystem (system: {
        default = nixpkgs.legacyPackages.${system}.mkShellNoCC {
          packages = [ moonbit-overlay.packages.${system}.latest ];
        };
      });
    };
}
