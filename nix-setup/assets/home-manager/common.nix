{ pkgs, ... }:

{
  # Bump this to the nixpkgs release you started on; don't chase it.
  # See https://nix-community.github.io/home-manager/release-notes.xhtml
  home.stateVersion = "24.11";

  programs.home-manager.enable = true;

  # Shared CLI essentials — safe to declare for every host.
  home.packages = with pkgs; [
    ripgrep
    fd
    bat
    eza
    just
    ast-grep
    gh
    jq
    hyperfine
  ];

  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    enableCompletion = true;

    shellAliases = {
      ll = "eza -la --git";
      ls = "eza";
      cat = "bat --paging=never";
      g = "git";
    };

    history = {
      size = 100000;
      save = 100000;
      ignoreDups = true;
      share = true;
    };

    # Free-form zshrc additions go here. Keep them minimal; prefer
    # dedicated programs.* modules when one exists.
    initContent = ''
      # ghq + fzf quick-jump
      function gj() {
        local dir
        dir=$(ghq list --full-path 2>/dev/null | fzf) && cd "$dir"
      }
    '';
  };

  programs.git = {
    enable = true;
    # user.name / user.email are injected per-host from flake.nix.
    settings = {
      init.defaultBranch = "main";
      pull.rebase = true;
      push.autoSetupRemote = true;
      rebase.autoStash = true;
    };
    ignores = [
      ".DS_Store"
      ".direnv/"
      "result"
      "result-*"
    ];
  };

  programs.starship = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
  };
}
