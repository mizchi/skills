---
name: justfile
description: Reference for just command runner. Provides justfile syntax and GitHub Actions examples.
---

# justfile Skill

just is a command runner for project-specific commands. Similar to Make but simpler.

## Basic Syntax

```just
# Default recipe (runs when just is called without arguments)
default:
  @echo "Available: just --list"

# Basic recipe
build:
  cargo build --release

# Dependencies
test: build
  cargo test

# Arguments
greet name:
  echo "Hello, {{name}}!"

# Default arguments
serve port="8080":
  python -m http.server {{port}}

# Variadic arguments
run *args:
  cargo run -- {{args}}
```

## Variables

```just
# String
version := "1.0.0"

# Shell command result
git_hash := `git rev-parse --short HEAD`

# Environment variable with default
home := env_var_or_default("HOME", "/tmp")

# Usage
info:
  echo "Version: {{version}}, Hash: {{git_hash}}"
```

## Settings

```just
# Shell
set shell := ["bash", "-cu"]

# Load .env
set dotenv-load

# Continue on error
set ignore-errors

# Suppress command echo
set quiet

# Working directory
set working-directory := "subdir"
```

## Conditionals

```just
# OS detection
install:
  {{if os() == "macos" { "brew install foo" } else { "apt install foo" }}}

# Architecture detection
build:
  {{if arch() == "aarch64" { "make arm" } else { "make x86" }}}
```

## Built-in Functions

| Function | Description |
|----------|-------------|
| `os()` | OS name (linux, macos, windows) |
| `arch()` | Architecture (x86_64, aarch64) |
| `env_var("NAME")` | Get environment variable |
| `justfile_directory()` | Directory containing justfile |
| `invocation_directory()` | Directory where just was invoked |

## Common Commands

```bash
just              # Run default recipe
just recipe       # Run specific recipe
just recipe arg   # Run with arguments
just --list       # List recipes
just --dry-run    # Show without running
just --choose     # Select with fzf
just --fmt        # Format justfile
```

## GitHub Actions

Use `extractions/setup-just@v3`. See `assets/gh_action_example.yaml` for full example.

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: extractions/setup-just@v3
    # with:
    #   just-version: '1.40.0'  # Optional version

  - run: just build
  - run: just test
```

## Practical Example

```just
set dotenv-load
set shell := ["bash", "-cu"]

default:
  @just --list

# Dev server
dev:
  npm run dev

# Build
build:
  npm run build

# Test
test *args:
  npm test {{args}}

# Lint + format
check:
  npm run lint
  npm run format:check

# CI (called from GitHub Actions)
ci: check build test

# Release
release version:
  git tag -a v{{version}} -m "Release v{{version}}"
  git push origin v{{version}}

# Cleanup
clean:
  rm -rf dist node_modules
```

## References

- https://github.com/casey/just
- https://just.systems/man/en/
- https://github.com/extractions/setup-just
