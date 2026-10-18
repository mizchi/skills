---
name: void-app
description: "Build full-stack apps with Void (the void npm package from VoidZero) and Vite+, especially React Pages with Cloudflare D1. Use when scaffolding a Void app, writing typed loaders/actions/forms, generating database migrations, adding tests, or preparing a Void deployment. Includes pnpm build approvals, form reset behavior, and redirect-query pitfalls. Not for the Void editor or TypeScript's void type."
---

# Void app cheat sheet

Tested on 2026-10-18 with **Void / @void/react 1.1.11, Vite+ 1.3.0, Node 24.21.0+, pnpm 12.14.0**. These are a working baseline, not evergreen version requirements. For another version, check its `engines`, CLI help, peer dependencies, and bundled docs before copying a workaround.

Japanese counterpart: [SKILL-ja.md](SKILL-ja.md).

## Read the installed docs first

Void ships Markdown docs in `node_modules/void/docs/`. Start with `guide/quickstart.md`, then read the section needed for the task:

| Task | Bundled document |
| --- | --- |
| CLI flags, generated types | `reference/cli/setup.md` |
| Loader props, dynamic routes | `guide/pages-routing/loaders.md`, `guide/pages-routing/overview.md` |
| Forms, named actions, failures | `guide/pages-routing/actions-and-forms.md` |
| Layouts, titles, language | `guide/pages-routing/layouts.md`, `guide/pages-routing/head.md` |
| Schema, migrations, local state | `guide/database.md`, `guide/database/d1.md`, `reference/cli/database.md` |
| Typed API client | `guide/typed-fetch.md` |
| Cloudflare / platform deployment | `guide/deployment.md`, `reference/cli/deploy.md` |

Use the project's local CLI through `pnpm exec`. Keep the `void` CLI/runtime and adapter versions aligned. Keep unrelated worktree changes intact.

## Bootstrap

In a new, empty directory:

```sh
node --version
pnpm init
pnpm add -D void
pnpm exec void init
```

Choose **Vite+ → React → D1 (SQLite)**, then the intended deployment target. The wizard installs project-local Vite+; a global `vp` install is optional. Preserve an existing package-manager version and lockfile. If no deployment is requested, skip target setup; selecting a target is separate from publishing.

A manual pnpm install can finish linking packages but report blocked dependency builds. With the tested pnpm version:

```sh
pnpm approve-builds esbuild workerd --yes
# Approve sharp too only if it is needed and blocked.
pnpm exec void init
```

Review/retain the scaffold's build policy in `pnpm-workspace.yaml`. Void uses its bundled SQLite binaries, so keep `better-sqlite3: false` under `allowBuilds`. Older pnpm releases have different approval flags/configuration: consult `pnpm approve-builds --help` rather than disabling build gating globally.

Then:

```sh
pnpm exec void db migrate
pnpm exec vp dev
```

Default URL: `http://localhost:5173`. Run `void db seed` only when a seed file is present and a local reset is intended.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `vite.config.ts` | Vite+ tooling, `voidPlugin()`, React adapter |
| `void.config.ts` | Target, worker compatibility date, head defaults |
| `db/schema.ts` | Drizzle schema, source of truth |
| `db/migrations/` | Generated, reviewed SQL and schema snapshots |
| `db/seed.ts` | Optional sample data via `defineSeed` |
| `pages/index.server.ts` | GET loader and mutations for `/` |
| `pages/index.tsx` | UI; import `Props` with `import type` |
| `pages/notes/[id].server.ts` + `.tsx` | Dynamic `/notes/:id` page |
| `pages/layout.tsx` | Shared layout and CSS import |
| `routes/api/notes.ts` | HTTP-method exports for `/api/notes` |
| `src/contracts/` | Input validators and shared types |
| `src/lib/` | Pure logic; keep UI state in components/hooks |
| `.void/` | Generated types and local D1 state; ignore in Git |

Keep `void.config.ts`, generated migrations, the package lock, and `void.lock.json` when created. Ignore `node_modules/`, `dist/`, `.void/`, `.wrangler/`, `.void-wrangler.jsonc`, and local secrets. Do not delete `.void/` to fix a type error: it also contains local data.

## Minimal schema → validator → loader/action

```ts
// db/schema.ts
import { sql } from 'void/db';
import { integer, sqliteTable, text } from 'void/schema-d1';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

```ts
// src/contracts/note.ts
import { createInsertSchema } from 'void/drizzle-zod';
import { notes } from '../../db/schema';

export const createNoteSchema = createInsertSchema(notes, {
  body: (schema) => schema.trim().min(1).max(4000),
}).pick({ body: true });
```

```ts
// pages/index.server.ts
import { notes } from '@schema';
import { defineHandler, type InferProps } from 'void';
import { db, desc } from 'void/db';
import { createNoteSchema } from '../src/contracts/note';

export const loader = defineHandler(async () => ({
  notes: await db.select().from(notes).orderBy(desc(notes.id)),
}));
export type Props = InferProps<typeof loader>;

export const actions = {
  create: defineHandler.withValidator({ body: createNoteSchema })(async (_c, { body }) => {
    await db.insert(notes).values(body);
  }),
};
```

`void/db` enables D1 binding inference; `@schema` is supplied by Void. Derive validators from the table and `pick` only writable fields. A default DB column can make an insert-schema field optional; require it explicitly if the form contract requires a string. Add `zod` as a direct dependency when importing it directly. For URL fields, validate HTTP(S) schemes, length, and credentials on the server, not just with `<input type="url">`.

## Typed forms and navigation

```tsx
// pages/index.tsx
import { Form, useForm } from '@void/react';
import { useEffect } from 'react';
import type { Props } from './index.server';

export default function Home({ notes }: Props) {
  const form = useForm('/?create', { body: '' });
  useEffect(() => {
    if (form.wasSuccessful) form.setData('body', '');
  }, [form.wasSuccessful]);

  return <main>
    <ul>{notes.map((note) => <li key={note.id}>{note.body}</li>)}</ul>
    <Form form={form}>
      <label>Note<input value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} /></label>
      {form.errors.body && <p>{form.errors.body}</p>}
      <button disabled={form.pending}>Save</button>
    </Form>
  </main>;
}
```

- `loader` runs on GET and returns typed component props. An action returning nothing refreshes the loader.
- Export singular `action` for one mutation or plural `actions` for named mutations; do not mix them. A named action URL ends in `?create`, `?update`, etc.
- Use `Form` + `useForm` for form state/errors; use `action()` for buttons. Check `result.ok` and handle thrown failures.
- **After a successful submit, `reset()` restores the submitted values**, because they became the new initial values. Clear a create form with `setData`; keep input intact on failure.
- Use `Link` from `@void/react` for page navigation. For dynamic forms: `useForm('/notes/:id?update', data, { params: { id } })`.
- Validate IDs as positive safe integers before querying. Return 404 for malformed or missing records.
- Set `head.htmlAttrs.lang` and viewport defaults in `void.config.ts`; use `defineHead<Props>` in `.server.ts` for titles.

**Void 1.1.11 redirect pitfall:** a path-absolute `c.redirect('/')` inherits the request query. After a named delete action this produced `/?delete`. When the destination should have a clean query, return a same-origin absolute URL:

```ts
// After a successful deletion in pages/notes/[id].server.ts:
return c.redirect(new URL('/', c.req.url).href, 303);
```

Check the final URL in E2E; do not just assert that the old card disappeared. Recheck this behavior before carrying the workaround to a later release.

## Typed API routes

```ts
// routes/api/notes.ts
import { notes } from '@schema';
import { defineHandler } from 'void';
import { db, desc } from 'void/db';

export const GET = defineHandler(async () => ({
  notes: await db.select().from(notes).orderBy(desc(notes.id)),
}));
```

Call with `import { fetch } from 'void/client'`, then `await fetch('/api/notes')`. The wrapper returns parsed data; it is not a native `Response`. Paths, exported methods, and validated inputs are generated from routes. Run `pnpm exec void prepare` before typechecking after a fresh clone.

## Database command table

| Command (`pnpm exec` prefix) | Effect |
| --- | --- |
| `void db generate` | Schema diff → SQL + snapshots; review and commit |
| `void db migrate` | Apply pending local migrations, preserving data |
| `void db seed` | **Reset local DB**, apply migrations, execute seed |
| `void db reset` | **Reset local DB**, reapply migrations |
| `void db push` | Apply schema directly for local prototyping |
| `void db execute 'SELECT * FROM notes'` | Inspect local data |
| `void db status` | Show local/remote migration status; remote needs a target/auth |

For repeatable changes: edit schema → generate → review SQL → migrate locally → test → deploy. Do not replace migration history after it has been applied/shared. Replacing a starter's initial migrations is only appropriate before applying them anywhere. D1 development state normally lives in `.void/`; `voidPlugin({ persistTo: 'local-state' })` can change it. Start the dev server once to record the new directory before CLI DB commands.

## Worked column addition (verified)

In the link-note baseline, add `isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false)` to the existing `link_notes` table. Keep its initial migration intact. The generated second migration was:

```sql
ALTER TABLE `link_notes` ADD `is_read` integer DEFAULT false NOT NULL;
```

```sh
pnpm exec void db export --output .void/before-migration.sql
# Edit db/schema.ts, then:
pnpm exec void db generate
# Read the new SQL; check for unexpected table rebuilds or data removal.
pnpm exec void db status      # second migration: local pending
pnpm exec void db migrate     # Applied 1 migration
pnpm exec void db migrate     # All migrations are up to date
pnpm exec void db status      # both migrations: local applied
```

For this change, stop the dev server before editing/applying and restart it afterward, so the new schema is not queried before the column exists. Compare API rows before and after, excluding only the added property. All original fields of the three existing rows were unchanged and `isRead` was `false` for each.

Regression tests used `node:sqlite` with the actual generated SQL: apply the old migration, insert a row, apply the remaining history, verify full row preservation/defaults/NOT NULL/auto-increment, then test the full chain on an empty DB. Playwright also verified updating the new field and retaining it after reload. This exercised local D1, not a remote migration.

## Vite+ checks and tests

Use `defineConfig` from **`vite-plus`** so `test`, `lint`, and `fmt` are typed. The generated `vite` package alias/override is intentional; preserve it.

For **pure Node unit tests**, skip the Worker/React plugins in test mode:

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { voidReact } from '@void/react/plugin';

export default defineConfig(({ mode }) => ({
  plugins: mode === 'test' ? [] : [voidPlugin(), voidReact({ react: { compiler: true } })],
  test: { include: ['src/**/*.test.ts'] },
  lint: { options: { typeAware: true, typeCheck: true }, ignorePatterns: ['.void/**', 'dist/**'] },
  fmt: { ignorePatterns: ['.void/**', 'dist/**', 'db/migrations/meta/**'] },
}));
```

Import test APIs from `vite-plus/test`. This mode tests validators/pure logic, not Worker bindings. Use Playwright against a real local Void server for UI + D1 behavior. Exclude Playwright reports/results from checks when adding E2E. Include `vite/client` in TS types for CSS side-effect imports and `node` for Node APIs, while preserving `void/env` and the generated `.void/tsconfig.json` extension.

```sh
pnpm exec void prepare
pnpm exec vp check
pnpm exec vp test
pnpm exec playwright test
pnpm exec vp build
```

Follow Red → Green → Refactor for application behavior. Isolate the E2E DB from development data; a temporary app directory with its own `.void/` works. Verify creation, reload persistence, search, mutations, error-state input preservation, 404s, and desktop/mobile overflow. Use role-scoped input locators: a loose `getByLabel('Note')` can also match cards with `aria-label` containing “Note”.

If React Compiler peer dependencies mismatch, inspect `pnpm peers check` and the installed React plugin's peers. The tested scaffold selected `oxc-transform-react` 0.149.0 while `@vitejs/plugin-react` 6.1.2 required `^0.152.0`; updating that dependency to a compatible version fixed it. Do not suppress all peer warnings.

## Deployment

When deployment is in scope:

```sh
pnpm exec void deploy --platform cloudflare
```

Void builds, provisions inferred resources, applies pending migrations, and publishes the Worker. Later runs can use the saved target. Keep `void.lock.json` for resource reuse; do not copy account IDs or credentials from another app. Local seed data is not automatically copied to production. Deployment itself was not exercised in the baseline app.

Check access control before publishing private notes: a CRUD starter without auth is a shared database for anyone who can reach it. Use Cloudflare Access or app auth as required. Report local verification separately from successful public deployment; a build alone does not verify deployment.

## Sources

- [Void Quickstart](https://void.cloud/guide/quickstart), [database](https://void.cloud/guide/database), [deployment](https://void.cloud/guide/deployment)
- [Vite+ guide](https://viteplus.dev/guide/), [Announcing Vite+ Alpha](https://voidzero.dev/posts/announcing-vite-plus-alpha)
- [azukiazusa: Build a Void app and deploy to Cloudflare](https://azukiazusa.dev/blog/void-vite-cloudflare-deploy/) — motivating walkthrough; verify APIs against bundled docs.
- Version-specific evidence: Void 1.1.11's `guide/pages-routing/actions-and-forms.md` and `dist/runtime/routing.mjs`; the baseline app's unit tests, Playwright CRUD tests, checks, and production build.
