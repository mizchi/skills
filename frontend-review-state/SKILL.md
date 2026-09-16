---
name: frontend-review-state
description: Use when reviewing state management architecture — classifying state types (server/URL/form/UI), checking for over-globalization, Jotai/Zustand/Redux patterns, derived state, and logout/cache invalidation. Covers checklist 23-state-management.md.
---

# Frontend Review — State Management

You are reviewing the state management architecture of a frontend project. The most common AI-generated problems are: putting everything in global state, storing server data in a global store instead of TanStack Query, and using coarse-grained selectors that cause the whole component tree to re-render.

## Procedure

1. Read `package.json` to identify the state management libraries in use.
2. Grep for global state usage patterns:
   ```bash
   # Jotai
   grep -rn "atom\|useAtom\|useAtomValue" src/ --include='*.ts' --include='*.tsx' | wc -l
   # Zustand
   grep -rn "create\b\|useStore\b" src/ --include='*.ts' --include='*.tsx' | head -20
   # Redux
   grep -rn "createSlice\|useSelector\|useDispatch" src/ --include='*.ts' --include='*.tsx' | head -20
   # Context
   grep -rn "createContext\|useContext" src/ --include='*.ts' --include='*.tsx' | head -20
   ```
3. Sample 3–5 of the largest atom / store definitions and assess what they contain.
4. Check for server state stored in global store (should be TanStack Query / SWR instead).
5. Check for URL state stored in global store (should be `useSearchParams` / `nuqs`).
6. Check for form state stored in global store (should be React Hook Form).

## State Classification

Correctly classify state by type. Each type has a dedicated tool — using the wrong tool is the root cause of most state management bugs.

```
Server state   → TanStack Query / SWR        (not global store)
URL state      → useSearchParams / nuqs      (not global store)
Form state     → React Hook Form             (not global store)
UI local       → useState / useReducer       (component-scoped)
UI global      → Jotai / Zustand / Context   (minimum scope)
```

Flag any server, URL, or form state found in a global Jotai/Zustand/Redux store. These are always bugs or design mistakes.

## Library-Specific Checks

### Jotai

- **Atom granularity**: one atom per logical unit; no large object atoms (`{ user, theme, notifications, ... }`).
- **Derived state**: use `atom(get => ...)` for computed values instead of storing redundant computed data.
- **Side effects**: isolate in `atomEffect` / `useAtomEffect`, not in `atom` setter callbacks.
- **Testability**: atoms declared at module top-level become global singletons — use `Provider` scoping in tests / Storybook.

```ts
// Bad: monolithic atom
const appStateAtom = atom({ user: null, theme: 'light', selectedItems: [], filterQuery: '' });

// Good: split + derived
const userAtom = atom<User | null>(null);
const themeAtom = atom<'light' | 'dark'>('light');
const filteredItemsAtom = atom((get) =>
  get(allItemsAtom).filter(item => item.name.includes(get(filterQueryAtom)))
);
```

### Zustand

- **Selector usage**: `useStore(state => state.specificField)` — never subscribe to the entire store object.
- **Shallow compare**: use `shallow` from `zustand/shallow` when selecting multiple fields as an object.
- **No direct mutation**: always use `set` / `get`, never mutate state outside of Zustand's setter.

```ts
// Bad: subscribes to everything
const { user, theme, cart } = useStore();

// Good: selector per field (or shallow for multi-field)
const user = useStore(state => state.user);
const { theme, cart } = useStore(useShallow(state => ({ theme: state.theme, cart: state.cart })));
```

### Redux Toolkit

- Is `createSlice` used (not hand-written reducers)?
- Is async data fetched via `createAsyncThunk` or RTK Query, not manual `dispatch` chains?
- Is server state in RTK Query / TanStack Query rather than a slice?

### Context API

- Context re-renders every Consumer when any value changes. If the context value is an object, split it into separate contexts per logical group (e.g., `AuthContext`, `ThemeContext`).
- Context is suitable for stable, low-frequency values (auth user, theme, i18n locale).
- Do not use Context as a general-purpose state manager for high-frequency updates.

## Logout & Cache Invalidation

A common bug: after logout, the next user who logs in sees cached data from the previous session.

Check that the logout handler:
1. Calls the server logout endpoint (session revocation)
2. Clears TanStack Query / SWR cache (`queryClient.clear()`)
3. Resets all auth-related global atoms / Zustand stores
4. Navigates to `/login` (after clearing, not before)

## Output

Write `<client-repo>/.frontend-review/report/latest/md/state-review.md` with:

- **State inventory**: which libraries are used, rough count of atoms/stores/contexts
- **Misclassified state**: server/URL/form state found in global store (these are bugs)
- **Anti-patterns found**: with file:line references
- **Logout/cache gap** if found
- **Recommended PRs**: each scoped to one logical refactor

Keep under 200 lines. File-level details stay in the raw search output, not in the report.

## Boundaries

- Do NOT rewrite state management code. The report identifies gaps; engineering implements fixes.
- Do NOT touch source files in the client repo.
- Rendering performance (re-renders, memo usage) is covered by `frontend-review-performance`.

## Reference

- Checklist: `23-state-management.md`, `17-pure-io-separation.md`, `21-api-layer.md`
- Related: `frontend-review-performance` (re-render profiling)
