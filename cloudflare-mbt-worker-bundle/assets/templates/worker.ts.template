// Cloudflare Worker entrypoint.
//
// wrangler bundles this file at deploy time via its built-in esbuild
// integration, so TypeScript and the relative `_build/` import of the
// MoonBit output both resolve into a single output. There's no
// pre-bundling step — `wrangler.jsonc` points `main` here directly.
//
// The MoonBit module runs its top-level `fn main { ... }` at import
// time, which registers `globalThis.__appServerFetch`. The telemetry
// and utels wrappers come from the same src/ tree.

// Side-effect import: moon's top-level `fn main { ... }` runs at load
// time and registers `globalThis.__appServerFetch`. The file is plain
// ESM JS so no .d.ts is needed; tsc resolves it under `module:
// "esnext"` + `moduleResolution: "bundler"`.
import "../_build/js/release/build/cloudflare-starterkit-mbt.js";
import { withTelemetry, withUtelsErrorTracking } from "./telemetry-runtime.ts";

declare global {
  // The MoonBit core registers this on import. The wrapper below
  // forwards each request to it.
  // eslint-disable-next-line no-var
  var __appServerFetch:
    | ((
        request: Request,
        env: Record<string, unknown>,
        ctx: ExecutionContext,
      ) => Promise<Response> | Response)
    | undefined;
}

const coreHandler = {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Response> | Response {
    if (typeof globalThis.__appServerFetch !== "function") {
      return new Response("app fetch handler not registered", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return globalThis.__appServerFetch(request, env, ctx);
  },
};

const fetchHandler = withUtelsErrorTracking(withTelemetry(coreHandler));

export default {
  fetch: fetchHandler.fetch,
};
