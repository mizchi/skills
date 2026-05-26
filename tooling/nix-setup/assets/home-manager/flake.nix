{
  description = "Personal home-manager configuration (macOS + ephemeral Linux sandbox)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager, ... }:
    let
      # ------------------------------------------------------------------
      # Replace these before first `home-manager switch`.
      # Keep this file PUBLIC-SAFE: no tokens, no private hostnames.
      # Secrets belong in ./private.nix (gitignored) or in sops-nix.
      # ------------------------------------------------------------------
      username = "user";
      email = "user@example.com";
    in
    {
      homeConfigurations = {
        # Full desktop profile — macOS (Apple Silicon).
        # Apply: home-manager switch --flake .#macos
        macos = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.aarch64-darwin;
          modules = [
            ./common.nix
            ./macos.nix
            {
              home.username = username;
              home.homeDirectory = "/Users/${username}";
              programs.git.settings.user = { name = username; email = email; };
            }
          ];
        };

        # Minimal profile — Claude Code web / other ephemeral Linux sandbox.
        # Apply: home-manager switch --flake .#ccweb
        ccweb = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.x86_64-linux;
          modules = [
            ./common.nix
            ./ccweb.nix
            {
              home.username = "root";
              home.homeDirectory = "/root";
              programs.git.settings.user = { name = username; email = email; };
            }
          ];
        };
      };
    };
}
