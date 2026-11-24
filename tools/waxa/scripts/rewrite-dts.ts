/**
 * tsc's rewriteRelativeImportExtensions rewrites `./x.ts` to `./x.js` in the
 * emitted JavaScript but not in declaration files. TypeScript before 5.x then
 * rejects `dist/*.d.ts` ("An import path cannot end with a '.ts' extension").
 *
 *   node scripts/rewrite-dts.ts dist
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Rewrite relative `from "./x.ts"` / `import("./x.ts")` specifiers to `.js`. */
export function rewriteDeclarationSpecifiers(text: string): string {
  return text.replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, "$1$2.js$1");
}

async function main(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".d.ts")) continue;
    const path = join(dir, name);
    const before = await readFile(path, "utf8");
    const after = rewriteDeclarationSpecifiers(before);
    if (after !== before) await writeFile(path, after);
  }
}

// import.meta.main needs Node 24.2+; compare paths so any Node 24 runs the CLI.
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main(process.argv[2] ?? "dist");
}
