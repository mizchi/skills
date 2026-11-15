# Current Void validation

Checked locally on 2026-11-16 with Node 24.22.2, pnpm 10.28.2, Void and
@void/react 1.9.1, Vite+ 1.6.0, React 19.3.1 and Chromium from Playwright 1.65.1.

The isolated app was generated in an empty temporary directory with:

```sh
pnpm exec void init --toolchain vite-plus --framework react --starter sqlite --deploy none --no-git
pnpm exec void db migrate
pnpm exec vp dev --host 127.0.0.1 --port 5187
```

Read the generated app's instructions and `node_modules/void/docs/` before
editing. Run the local SQLite migrations without a deployment target.
The generated form retained submitted text; a Playwright assertion expecting
an empty create form failed. Adding `{ resetOnSuccess: true }` made it pass.
A subsequent `pnpm exec vp build` also completed successfully.
The same check verified the inserted row after reload and input retention after
server validation rejected whitespace. A named action returning
`c.redirect('/', 303)` removed `clean` from `?clean&tab=profile` while retaining
`tab=profile`. An ordinary API GET redirect did not retain `?obsolete=1`.

Authoritative API details for this version are the bundled
`guide/pages-routing/actions-and-forms.md` and `reference/api/rewrites.md`.
This check covered local SQLite and the two documented form/redirect changes.
The older full CRUD/migration and React/Solid experiments are separate dated
records; they were not all repeated against 1.9.1. No remote migration or
publication was performed.
