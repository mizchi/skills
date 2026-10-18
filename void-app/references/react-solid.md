# Embed a Solid widget in React Pages

Verified on 2026-10-18: Void / @void/react 1.1.11, Vite+ 1.3.0, solid-js 1.9.17, vite-plugin-solid 2.11.14.

Keep the Void Pages adapter on React. Mount Solid inside a dedicated DOM element from a React effect. React owns the element; Solid owns only its children. This is a manual client-side integration, not a second Void Pages renderer and not Solid SSR hydration.

## Separate the JSX transforms

```sh
pnpm add solid-js
pnpm add -D vite-plugin-solid
```

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { voidReact } from '@void/react/plugin';
import solid from 'vite-plugin-solid';

export default defineConfig(({ mode }) => ({
  cacheDir: '.void/vite-cache',
  plugins: mode === 'test' ? [] : [
    voidPlugin(),
    voidReact({ react: { compiler: true, exclude: [/node_modules/, /\.solid\.tsx$/] } }),
    solid({ include: /\.solid\.tsx$/, ssr: false }),
  ],
  test: { include: ['src/**/*.test.ts'] },
}));
```

Put Solid JSX in `.solid.tsx` files and add `/** @jsxImportSource solid-js */` at the top. Keep React as the project's default JSX type source. The Solid plugin runs before Vite's normal JSX transform; excluding these files from React Compiler prevents double compilation.

Keep the Solid module behind `import()` inside the React effect, so importing the page on the server does not evaluate browser-only DOM code. A dynamic import can still appear in the server build as an unused chunk; its existence alone does not mean Solid rendered the initial HTML.

## Define the boundary

Share plain values and callbacks, with a lifecycle handle:

```ts
interface WidgetProps {
  count: number;
  onReset: () => void;
}
interface WidgetHandle {
  update(props: WidgetProps): void;
  dispose(): void;
}
```

The Solid module exports `mount(host, initialProps)`. Inside it, hold incoming props in `createSignal(initialProps)`, call `render()` once, and return `update` using the signal setter plus the disposer returned by `render`. Solid-local signals belong to the mounted component, so React prop updates do not reset them.

The React wrapper:

1. SSRs an overview and an empty `div` with a ref. Do not render React children inside the Solid host.
2. Creates the lifecycle handle in `useEffect`. Observe the host with `IntersectionObserver` if loading should wait for visibility.
3. On the first intersecting entry, disconnect the observer and dynamically import the Solid module. Mount once with the latest props, then replace/hide the React overview sibling.
4. Sends later React props through `handle.update()`. Solid can call a supplied callback to update React state.
5. On cleanup, disconnect the observer and call Solid's disposer once. If import resolves after cleanup, do not mount or update React state.

Keep the async loading state separate from the widget's domain state. Handle import failures by retaining the SSR overview and showing an error. Do not expose React Context to Solid or expect Solid Context to cross the boundary.

## What was exercised

The baseline app embeds a Solid reading meter below its React link list:

- Solid signals change a reading goal; React prop updates preserve that goal.
- React search updates the visible count displayed by Solid.
- A Solid button clears React's search through a callback.
- The module is not requested before the widget enters the viewport.
- Leaving the route removes the host; returning creates a new widget with fresh local state.
- A unit test covers import completion after disposal, mounting once with the latest props, and idempotent cleanup.
- JavaScript-disabled browser tests still see the React SSR list and summary.
- Desktop/mobile Playwright tests passed, as did production build and a browser smoke test of the production preview.

For interactive E2E, wait for the app's hydration marker before filling SSR-rendered controlled forms. Without attached handlers, an early fill can change DOM input values without updating form state. Use distinct accessible names for status elements: `<output>` already has an implicit `status` role.

Use a per-project Vite `cacheDir` when E2E fixtures share a symlinked `node_modules`; keep development and fixture optimization caches separate. Preserve the existing application checks and CRUD E2E when changing JSX tooling.

This proves **React SSR + deferred Solid client mounting**. For Solid SSR plus hydration, an additional server-rendering/hydration boundary is needed. Native Void Islands use the selected adapter's renderer; this recipe does not turn them into an automatic multi-framework island system. Astro + Void is an officially documented alternative for multi-framework SSR composition.

## Sources

- [Solid render and its disposer](https://docs.solidjs.com/reference/rendering/render)
- [Solid TypeScript: file-level JSX source overrides](https://docs.solidjs.com/configuration/typescript)
- [vite-plugin-solid include/exclude options](https://github.com/solidjs/vite-plugin-solid)
- [Void Islands](https://void.cloud/guide/pages-routing/islands)
- [Void Astro integration](https://void.cloud/integrations/frameworks/astro)
