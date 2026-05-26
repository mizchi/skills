---
name: frontend-review-security
description: Use when conducting a frontend security review — static analysis (risky HTML patterns, env var exposure), authentication/authorization audit (token storage, route guards, logout), and AI self-penetration testing. Runs `scripts/audit-security.sh`. For CVE triage and deprecated library detection, use `frontend-review-deps`.
---

# Frontend Review — Security

You are performing a frontend security review. The focus areas are:

1. **Static** — risky HTML sinks, environment variable exposure in client bundles
2. **Auth / Authorization** — token storage, route guards, session management
3. **AI self-pentest** — desk-check of common vulnerability patterns
4. **Staging environment** — HTTP headers, auth boundaries, cookie flags

## Procedure

1. Run `scripts/audit-security.sh --repo <client-repo>`.
2. Read `raw/security.json`.
3. For each `dangerouslySetInnerHTML` / `v-html` / `.innerHTML =` hit, locate the file and judge whether the input is sanitized.
4. Run the **Authentication & Authorization** review (see below).
5. Run the **Env / Config** review (see below).
6. For AI self-pentest, mentally walk through the attack scenarios below.
7. For staging, draft the header checklist.

## Authentication & Authorization Review

### Token storage

Check where access tokens are stored and flag insecure patterns:

| Storage | Risk | Verdict |
|---|---|---|
| `httpOnly` Cookie | JS-inaccessible, XSS-resistant | ✅ Recommended |
| `localStorage` | Readable by any JS on the page — XSS steals it | ⚠ Flag + require XSS mitigations |
| `sessionStorage` | Same XSS risk as localStorage | ⚠ Flag |
| In-memory (module variable) | Lost on reload; only viable in short-lived SPAs | Context-dependent |

- Check whether the refresh token is also stored in `httpOnly` Cookie.
- Check whether the access token lifetime is short (recommended: 15 min – 1 hour).

### Route guards

- Does `ProtectedRoute` (or equivalent) have a **loading state** that prevents a flash of the protected page before auth status resolves?

```tsx
// Bad: no loading state — redirects to /login during initial auth check
if (!user) return <Navigate to="/login" />;

// Good: loading state prevents flash
if (isLoading) return <LoadingSpinner />;
if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} />;
```

- Does the app redirect back to the original page after login (`redirect` / `redirect_to` param)?
- **Server-side authorization** exists for every protected API endpoint — frontend guards alone can be bypassed via DevTools or curl.

### Token refresh

- Does the API client auto-retry on 401 by refreshing the token first?
- Is refresh **deduplicated** so that parallel 401s don't trigger multiple refresh calls?

```ts
let refreshPromise: Promise<string> | null = null;
async function refreshToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

### Logout

- Does logout call the server endpoint AND clear all client-side state?

```ts
// Required logout sequence:
await api.post('/auth/logout');   // revoke server-side session
queryClient.clear();              // clear TanStack Query cache
authStore.reset();                // clear Zustand / Jotai auth atoms
router.replace('/login');        // navigate away before clearing is dangerous
```

- After logout, does a hard-reload show the previous user's data? (Check: TanStack Query devtools, React state, localStorage)

## Env / Config Review

- **`VITE_` / `NEXT_PUBLIC_` prefixed variables must not contain secrets.** Vite / Next.js embed these into the client bundle — anyone can read them in DevTools.
- **`.env` must not be committed.** Run: `git log --all --full-history -- '*.env'`
- Is `src/config.ts` (or equivalent) the single entry point for env var reads? Direct `import.meta.env.VITE_FOO` calls scattered in components are a review red flag.
- Does `config.ts` throw at startup if a required env var is missing?

```ts
// config.ts — startup-time validation
const requireEnv = (key: string): string => {
  const value = import.meta.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};
```

- Is `ImportMetaEnv` extended in `vite-env.d.ts` so that unknown `VITE_*` keys are caught by TypeScript?

## AI Self-Pentest Scenarios

Walk through each scenario mentally and note: OK / finding / unable-to-determine.

1. **XSS via URL parameter** — does a malicious `?q=<script>alert(1)</script>` get rendered unsanitized?
2. **XSS via form input** — is user-supplied HTML ever rendered with `dangerouslySetInnerHTML` without sanitization?
3. **CSRF** — do state-mutating API calls require a CSRF token or use `SameSite=Strict` cookies?
4. **Auth boundary bypass** — can an unauthenticated `fetch('/api/protected')` return data?
5. **Sensitive data in storage** — does `localStorage.getItem` reveal tokens, PII, or session data?
6. **Client-side-only authorization** — are there role checks in React code that are not mirrored server-side?
7. **Open redirect** — does the `redirect` / `next` login parameter allow arbitrary external URLs?

## Staging Checklist

Draft these for the human to run against the deployed staging URL:

- [ ] `Content-Security-Policy` header is present and restrictive
- [ ] `Strict-Transport-Security` (HSTS) with `max-age ≥ 31536000`
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] Cookies have `Secure`, `HttpOnly`, `SameSite=Strict` (or `Lax`)
- [ ] `GET /api/me` without a valid session returns 401, not user data
- [ ] `GET /api/admin-only` as a regular user returns 403, not data

## Output

Write `<client-repo>/.frontend-review/report/latest/md/security-review.md` with:

- **Static findings** (risky sinks, env var exposure)
- **Auth / Authorization findings** (token storage, route guard gaps, logout issues)
- **AI pentest notes** (each scenario: OK / finding / unable-to-determine)
- **Staging checklist** (to be executed by the human)
- **Issues to file** (`gh issue create` commands with titles and bodies)

Do NOT execute the `gh issue create` commands yourself — print them for the human.

## Boundaries

- Do NOT attempt actual exploitation. This is a desk review.
- Do NOT run scanners against production URLs.
- Do NOT touch the client source code.
- CVE triage and trend-watch are handled by `frontend-review-deps`.

## Reference

- Checklist: `10-security.md`, `25-auth-authorization.md`, `26-env-config.md`
- Phase: `week-3-security-vrt.md`
- OWASP: https://owasp.org/www-project-top-ten/
