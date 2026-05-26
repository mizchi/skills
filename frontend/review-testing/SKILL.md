---
name: frontend-review-testing
description: Use when auditing test infrastructure — vitest coverage, playwright configuration, VRT setup, coverage merging. Produces recommendations for Week 2 testing phase. Runs `scripts/audit-coverage.sh`.
---

# Frontend Review — Testing

You are auditing the testing posture of a frontend project. The phase is Week 2: establish vitest + playwright with synthetic coverage, keeping in mind:

- **E2E granularity**: initially, one case per Router / server controller branch (skeleton-first, not exhaustive).
- **Unit granularity**: component coverage is prioritized.
- **Coverage merge**: vitest V8 + playwright V8 combined via `monocart-coverage-reports` or `istanbul-merge`.

## Procedure

1. Run `scripts/audit-coverage.sh --repo <client-repo>`.
2. Read `coverage/coverage-summary.json` if it exists.
3. Inspect:
   - `vitest.config.*` — is coverage configured? provider v8?
   - `playwright.config.*` — projects, webServer, sharding
   - `tests/`, `e2e/`, `__tests__/` — current test count and shape
   - `package.json` scripts — `test`, `test:coverage`, `test:e2e`

## Output

Write `<client-repo>/.frontend-review/report/latest/md/testing-review.md` with:

- **Current state**: vitest configured? playwright configured? how many tests? what coverage %?
- **Gaps**: missing config, missing scripts, no coverage merge
- **Recommended PRs** (3-5 max): each with title, affected files, expected coverage delta
- **Branch coverage checklist** for the router/controller branches that should get the first E2E tests

## Component Testing — Testing Library First

For React component tests, prefer `@testing-library/react` over testing internal implementation:

- **Query by role / label / text** (`getByRole`, `getByLabelText`, `getByText`) rather than by class name or component internals.
- **User interactions** via `@testing-library/user-event` — `userEvent.click`, `userEvent.type` — not direct DOM event dispatch.
- **Async assertions** via `waitFor` / `findBy*` for state updates after async operations.

```tsx
// Bad: testing implementation details
const wrapper = render(<LoginForm />);
wrapper.find('button.submit').simulate('click');
expect(wrapper.state('isLoading')).toBe(true);

// Good: testing observable behaviour
render(<LoginForm />);
await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
expect(await screen.findByText('Welcome')).toBeInTheDocument();
```

When `@testing-library/react` is absent from `package.json`, flag it as a gap and recommend adding it alongside `@testing-library/user-event` and `@testing-library/jest-dom` (or `@testing-library/vitest-dom`).

For atom / store tests, use the library's own test utilities (e.g. Jotai `createStore()`) rather than rendering a component — keep component tests and state logic tests separate.

## In-Source Testing Pattern

For logic-heavy `.ts` files, co-locating tests in the same file (via `if (import.meta.vitest)` in Vite projects, or a build-time dead-code strip equivalent) is often preferable to separate test files:

- AI agents read the source and the spec in one file context, improving generation accuracy.
- Pure functions stay close to their invariants.
- Production builds strip the test block via `"import.meta.vitest": "undefined"` define.

Recommend this pattern when proposing new unit tests for utility/lib files.

## Test Failure Triage Protocol

When a test fails, the correct action is **not** to mechanically rewrite the test to pass. Prompt the human to decide:

1. **Spec changed** — the implementation is now correct; update the test.
2. **Implementation bug** — the test is correct; fix the implementation.
3. **Test was wrong** — the test never matched the intended spec; rewrite the test.

Document this triage in the output report. Flag any existing tests that appear to be "implementation echoes" (testing the exact internal path rather than observable behaviour) as candidates for case 3.

## MSW (Mock Service Worker) Principle

When the codebase fetches from external APIs, recommend MSW over jest-style module mocks:

- Mock only at the network boundary (`http.get`, `http.post` handlers).
- Keep the actual state management / component wiring intact — only the HTTP response is stubbed.
- Place shared handlers in `src/test-utils/handlers.ts` or equivalent.

This avoids tests that pass even when the integration contract breaks.

## Coverage Guidance

- **Target**: 80%+ for pure lib/utility files; 60%+ for UI components.
- **Anti-goal**: Do NOT inflate tests to reach 100%. Prefer fewer tests that encode real specs over many tests that only enumerate implementation details.
- Generated UI components (e.g. shadcn/ui output) are coverage-exempt.

## VRT Stability Tips

- Generate reference snapshots inside a **Linux container** (same OS as CI) to eliminate font-rendering and antialiasing differences between machines.
- Inject web fonts globally via a shared fixture rather than per-test — font unavailability causes pixel diff false positives.

## Boundaries

- Do NOT write actual test code — propose structure and counts only.
- Do NOT run `vitest` or `playwright` from this skill; the scripts don't execute tests, only read existing reports.

## Reference

- Checklist: `07-unit-test.md`, `08-e2e-playwright.md`, `15-vrt.md`, `13-kpi-tracking.md`
- Phase: `week-2-testing.md`, `week-3-security-vrt.md`
