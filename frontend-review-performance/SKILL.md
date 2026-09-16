---
name: frontend-review-performance
description: Use when reviewing React rendering performance — profiler-first diagnosis, memo/useCallback/useMemo correctness, virtual scroll, useTransition/useDeferredValue, and canvas/WebGL separation for data-heavy UIs. Covers checklist 24-rendering-performance.md.
---

# Frontend Review — Rendering Performance

You are reviewing the rendering performance of a React frontend. The most common AI-generated problems are: applying `memo` / `useCallback` / `useMemo` everywhere without measuring (or never at all), missing virtual scroll on large lists, and Context changes re-rendering unrelated components.

## Procedure

1. Check `package.json` for performance-related packages (`@tanstack/react-virtual`, `react-window`, `@welldone-software/why-did-you-render`, etc.).
2. Grep for existing memo usage:
   ```bash
   grep -rn "React\.memo\|useMemo\|useCallback" src/ --include='*.tsx' --include='*.ts' | wc -l
   grep -rn "useVirtualizer\|FixedSizeList\|VariableSizeList" src/ --include='*.tsx' | wc -l
   grep -rn "useTransition\|useDeferredValue\|startTransition" src/ --include='*.tsx' | wc -l
   ```
3. Find the largest list-rendering components (look for `.map(` on arrays with no size guard).
4. Look for Context providers that change frequently and might cause wide re-renders.
5. For `iot-ops` / map / chart apps: check whether heavy rendering is in React state or in a canvas/WebGL ref.

## Profiler-First Principle

**Do not recommend memo / useCallback / useMemo without first profiling.** Premature memoization adds cognitive overhead and can slow things down (each hook has a cost).

When writing the report, prefix every optimization recommendation with: "After profiling confirms X re-renders per interaction, consider Y."

## Memoization Correctness

When memoization IS present (or being recommended), check for these common mistakes:

### React.memo

- Is `React.memo` applied to components that receive stable props from their parents?
- Is the parent passing **new object/array/function references** on every render (negating memo)?

```tsx
// Bad: new array on every render — memo is useless
<List items={data.filter(x => x.active)} />

// Good: stable reference with useMemo
const activeItems = useMemo(() => data.filter(x => x.active), [data]);
<List items={activeItems} />
```

### useCallback

- Is `useCallback` used when passing callbacks to `memo`-wrapped children?
- Are dependency arrays accurate (no missing or unnecessary deps)?

```tsx
// Bad: new function reference every render
<Button onClick={() => handleDelete(id)} />

// Good: stable reference
const handleDeleteClick = useCallback(() => handleDelete(id), [id, handleDelete]);
<Button onClick={handleDeleteClick} />
```

### useMemo

- Is `useMemo` applied to **expensive** computations (filter/sort/aggregate on large arrays), not trivial ones (string concat, boolean check)?
- Are dependency arrays correct?

## Virtual Scroll

For lists with 100+ items, virtual scroll is almost always necessary for acceptable performance.

Recommended: `@tanstack/react-virtual` (works with any layout, no CSS constraints).

```tsx
const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
});

return (
  <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map(vItem => (
        <div key={vItem.key} style={{ position: 'absolute', top: vItem.start, height: vItem.size }}>
          <ListItem item={items[vItem.index]} />
        </div>
      ))}
    </div>
  </div>
);
```

Flag any list that maps over an array > 100 items without virtual scroll.

## Concurrent Features (React 18+)

- **`useTransition`** — wrap heavy non-urgent state updates so the UI stays responsive:

```tsx
const [isPending, startTransition] = useTransition();
const handleFilterChange = (q: string) => {
  startTransition(() => setFilterQuery(q));
};
```

- **`useDeferredValue`** — defer a value that drives expensive rendering:

```tsx
const deferredQuery = useDeferredValue(filterQuery);
const filtered = useMemo(() => items.filter(i => i.name.includes(deferredQuery)), [deferredQuery, items]);
```

Flag heavy filter/sort operations that block the main thread on every keystroke — these are candidates for `useTransition`.

## Canvas / WebGL Separation (iot-ops / map / chart apps)

For data-dense UIs (real-time dashboards, map overlays, charting), React state is the wrong tool for per-frame updates.

Check whether:
- High-frequency data (sensor readings, map tile updates, chart data) bypasses React state and goes directly to canvas/WebGL via `useRef`.
- React only controls the layout shell and control panel; the canvas/WebGL layer handles rendering independently.

```ts
// Pattern: React controls mount; canvas reads data via ref
const canvasRef = useRef<HTMLCanvasElement>(null);
useEffect(() => {
  const renderer = new WebGLRenderer(canvasRef.current!);
  const unsub = sensorStream.subscribe(data => renderer.update(data)); // no setState
  return unsub;
}, []);
```

## Output

Write `<client-repo>/.frontend-review/report/latest/md/performance-review.md` with:

- **Profiling recommendation**: what to measure first and how (React DevTools Profiler, why-did-you-render)
- **Memoization gaps / misuse**: file:line references for each finding
- **Virtual scroll candidates**: component name, estimated list size
- **Concurrent feature opportunities**: interactions that block the thread
- **Canvas/WebGL assessment** (if applicable): is high-frequency data bypassing React state?
- **Recommended PRs**: one optimization per PR, profiling benchmark in PR description

Keep under 200 lines. Recommendations without profiling evidence must be explicitly flagged as "unconfirmed — profile first."

## Boundaries

- Do NOT run profiling sessions — describe what to measure and how.
- Do NOT propose optimization without a measurement plan.
- Do NOT touch source files in the client repo.
- State management architecture (store design, selector granularity) is covered by `frontend-review-state`.

## Reference

- Checklist: `24-rendering-performance.md`, `23-state-management.md`, `C2-lighthouse.md`
- Tools: React DevTools Profiler, `@welldone-software/why-did-you-render`, `@tanstack/react-virtual`
