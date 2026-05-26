{ pkgs, ... }:

{
  # Ephemeral Linux sandbox (Claude Code web, throwaway containers).
  # Goal: cold-start < 2 min with cache.nixos.org substitutes.
  # Skip anything that builds from source or pulls large dependencies.

  home.packages = with pkgs; [
    # Only what common.nix didn't already cover and is worth the substitute cost.
    # Add CLI extras here as needed — each one extends cold-start time.
  ];

  # No GUI editor on sandbox (saves 100+ MB and fontconfig quirks).
  programs.helix.enable = false;

  # Keep zsh minimal — no heavy completion systems that scan the whole PATH.
}
