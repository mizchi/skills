# Working in this repository

Run `just init` from the repository root to install the external skills pinned in apm.yml and apm.lock.yaml. Use the conventional-changelog skill when preparing a release.

Keep the library implementation under `src/` and its tests under `test/`. Run `pnpm check` after changes. Develop behavior changes with a failing test first. Keep local secrets in an ignored `.env` file.
