{ pkgs, ... }:

{
  # macOS-specific packages. GUI apps are NOT managed here —
  # use nix-darwin + homebrew for those.
  home.packages = with pkgs; [
    # Dev tooling that makes sense on a workstation
    neovim

    # MoonBit / Rust / wasm toolchains can go here or per-project flakes;
    # per-project is usually cleaner.
  ];

  programs.helix = {
    enable = true;
    settings = {
      theme = "ayu_dark";
      editor = {
        line-number = "relative";
        bufferline = "multiple";
      };
    };
  };

  # macOS-only launchd agents would go here, e.g.:
  # launchd.agents.my-task = { ... };
}
