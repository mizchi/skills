# Static Astro pages with native Void authentication

Verified on 2026-10-18 in link-note with Void / @void/react 1.1.11, Astro 7.4.0, Vite+ 1.3.0, Node 24.21.0, and pnpm 12.14.0. Recheck package detection and bundled docs when versions change.

## Keep runtime routing in Void

Void-managed auth is supported in native Cloudflare Void apps, not Astro framework mode. If static informational pages are the only Astro requirement, use an independent workspace package:

```text
package.json                 Void / React / Vite+ dependencies; no Astro dependency
pnpm-workspace.yaml          packages: [site]
site/package.json            Astro dependency, build: astro build
site/astro.config.mjs        output: static, outDir: ../public
site/src/pages/index.astro   public /
site/src/pages/about.astro   public /about
public/                     generated HTML; ignored by Git
pages/login.*               Void login UI
pages/signup.*              Void registration UI
pages/app/index.*           protected Void library
pages/app/notes/[id].*      protected Void detail and actions
routes/api/notes.ts         authenticated JSON API
auth.ts                     defineAuth configuration
middleware/01.session.ts    shared user, page redirects, no-store
```

Run the Astro build before `vp dev`, `vp build`, and Playwright fixture setup. Static pages use normal anchors to `/login`, `/signup`, and `/app`; no Astro Cloudflare adapter or Void plugin is needed in the static package. Keep any existing D1 persistence directory and migrations in the Void root. `build.format: 'file'` produces `about.html`, served at the clean `/about` URL in the verified dev server and production preview.

Astro's dev server can preview static edits separately. Rebuild the static package before checking its output through Void. Reserve the output directory for generated files, since Astro rebuilds it.

## Include actual client entrypoints in dependency discovery

With HTML entrypoints only in `public/`, Vite's default client scan missed the React page dependencies. The first login SSR discovered `zod` late, rebuilt optimized dependencies, and caused a concurrent Worker request to fail with `fetch failed`. Set the scan entrypoints explicitly:

```ts
optimizeDeps: {
  entries: ['pages/**/*.tsx'],
  include: ['better-auth/react', 'solid-js', 'solid-js/web', 'zod', 'void/pages-prefetch'],
},
environments: {
  void_worker: { optimizeDeps: { include: ['better-auth/react'] } },
},
```

The Solid entries are specific to the mixed React/Solid example. Keep `cacheDir: '.void/vite-cache'` isolated between development and temporary E2E applications. Waiting for an SSR route alone did not fix the late dependency discovery. Playwright readiness should still target `/login`, not the static `/`.

## Native auth and ownership

Use `auth` from `void/client` for `signUp.email`, `signIn.email`, and `signOut`. Enable the email provider in `void.config.ts`; use root `auth.ts` with `defineAuth(({ defaults }) => ({ ...defaults, ... }))` for password policy. Keep the defaults when overriding nested options. The example enforces 12–128 characters on both the server and registration form; never trim the password.

Use `getUser()` for optional shared identity and `requireAuth(c)` before protected database access. A page middleware can redirect anonymous GET requests to `/login?next=...`; mutation requests and protected APIs must return 401. Validate the return URL against an application path allowlist, reject external URLs, backslashes and control characters, and normalize dot segments before allowing the result.

Every operation must filter by the session's user ID:

- List: `where(eq(linkNotes.ownerId, user.id))`.
- Detail, update, pin, read status and delete: combine the note ID with the owner ID using `and(...)`.
- Create: use `{ ...validatedBody, ownerId: user.id }`; the input validator must not accept owner IDs.
- A missing owned row returns 404; do not reveal whether another user owns it.

Use `Cache-Control: no-store` for private pages/APIs and auth pages. After login, a full navigation gets fresh authenticated SSR and shared identity. After logout, replace the page with `/login` and verify the old server session is invalid. Client-side hiding alone is not authorization.

## Preserve existing rows

Generate auth table migrations with `void db generate`; do not duplicate Better Auth's generated tables in `db/schema.ts`. Review the generated SQL before applying it. The example adds nullable `owner_id` plus an `(owner_id, id)` index, alongside the auth tables. Null supports retaining legacy rows without assigning them to an arbitrary newly registered user.

Legacy rows stay inaccessible through normal user queries until an administrator explicitly assigns an owner. Do not automatically grant them to the first registrant. Export before migration, compare every original field afterward, and rerun migration to verify it is already applied. Migration tests should cover both old populated databases and fresh installations.

## Verification and limits

The example passed 56 unit tests and 18 Playwright tests across desktop and mobile, plus a production preview smoke test. Tests covered registration errors, successful login/logout, rejected stale sessions, anonymous API/action denial, cross-user reads and all mutations, owner spoofing, cross-origin mutation denial, native CRUD, and lazy Solid mounting. Authenticated SSR was also checked with JavaScript disabled after installing a valid session cookie. Both Astro pages contained no scripts and worked without JavaScript.

Production preview needs a `BETTER_AUTH_SECRET` **Worker binding**, not just an unbound shell variable. A temporary preview fixture supplied its own random secret binding and separate migrated D1; neither was copied into application source. Void's deployment command provisions/reuses the production secret. Preview and deployment are separate checks; the example was not deployed remotely.

Email verification, password reset email delivery, and social providers were not implemented. Registration/login forms require JavaScript; static pages and authenticated SSR content do not.

Sources: [Void authentication](https://void.cloud/guide/auth), [Void Astro integration](https://void.cloud/integrations/frameworks/astro), [Astro configuration](https://docs.astro.build/en/reference/configuration-reference/), and the installed Void 1.1.11 auth/client/runtime sources.
