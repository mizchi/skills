# Working in this repository

Run `just init` from the repository root to install the external skills pinned in apm.yml and apm.lock.yaml. Use the conventional-changelog skill when preparing a release.

Keep workspace crates under `crates/`. Run `just check` after changes. Use `just mutants` when changing tested behavior. Develop behavior changes with a failing test first. Keep local secrets in an ignored `.env` file.
