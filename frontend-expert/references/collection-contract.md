# Frontend audit collection contract

The bundled collectors require Node 24+. Run each script by its path inside the
installed skill; `scripts/` is not the client repository's script directory.
Each installed collector includes its runtime helpers and works without another
skill or a private review toolkit.

```sh
<skill-dir>/scripts/audit-triage.sh --repo /absolute/client/path
```

Reports go to `<client-repo>/.frontend-review/report/latest/raw/<category>.json`
and a short `md/<category>-collection.md`. JSON has `schemaVersion: 1`, `category`,
`status`, `coverage`, `issues`, and `data`. Read measured values under `data`.
Exit 0 means the declared collection completed, 1 means partial collection, and
2 means invalid input or an execution error. A complete collection is not a clean
codebase verdict; findings can be present in complete data.

Missing audit tools, coverage, authentication or unknown output schemas remain
explicit gaps. A null lint/error/coverage field is not zero. Do not ratchet a
baseline using partial data or silently reuse an older report.

Default collection reads project files and existing reports; it does not install
dependencies, run tests, execute package scripts or modify source. `--run-checks`
additionally enables these bounded commands for the relevant collector:

- CI: `gh run list` with metadata fields, requiring the user's read access.
- Dependencies: `pnpm audit --json` and `pnpm outdated --json`.
- TypeScript: the local `pnpm exec tsc --noEmit --pretty false`.

pnpm audit exit 1 retains its vulnerability data. Transport errors and unknown
schemas are partial, not empty successful results. No lifecycle scripts run.
The lint collector inventories configuration; run the project's existing read-only
linter separately to obtain error/warning counts. Coverage reads an existing
summary and records its modification time rather than running tests. Similarity
reports exact eight-line blocks, not AST-level duplication. TypeScript and
security lexical screens produce candidates, not type/data-flow/auth guarantees.
Security reports contain file/line/rule only, without source or credential values.

The domain instructions live in each SKILL.md; unavailable historical checklists
are not prerequisites. Apply the client's explicit KPI and security requirements,
record unassessed areas, and avoid inferring that a package is deprecated solely
from its name, age or popularity. A role/perspective skill can read existing raw
data, but should request collection or state its limits when that data is absent.
