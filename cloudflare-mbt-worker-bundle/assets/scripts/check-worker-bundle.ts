// Post-build sanity check for the bundled Worker.
//
// `moon build --target js --release` + `cf build` can
// produce a bundle with subtle corruption: stray \x1f control bytes
// from the wasm host that emits the MoonBit JS (sqlc-gen-moonbit #17),
// a far-too-small file (moon produced an empty stub because of a
// transitive failure), or a missing marker that the worker entry
// relies on. None of these surface as a crash at deploy time — they
// surface as a hung worker on first request, which is hard to debug
// after the fact.
//
// This script enforces a minimum set of invariants. Extend
// REQUIRED_MARKERS when you add code paths that must appear in the
// bundle (e.g. a scheduled cron handler).

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: check-worker-bundle.ts <bundle.js-or-bundle-directory>");
  process.exit(2);
}

let info;
try {
  info = await stat(target);
} catch (error) {
  console.error(`worker bundle check: cannot stat ${target}: ${error.message}`);
  process.exit(1);
}
if (!info.isFile() && !info.isDirectory()) {
  console.error(`worker bundle check: ${target} is not a file or directory`);
  process.exit(1);
}
const paths = info.isFile() ? [target] : (await readdir(target, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(?:m?js|cjs)$/.test(entry.name))
  .map(entry => join(entry.parentPath, entry.name));
const modules = await Promise.all(paths.map(path => readFile(path, "utf8")));
const size = modules.reduce((total, module) => total + Buffer.byteLength(module), 0);
if (size < 1024) {
  console.error(
    `worker bundle check: ${target} is only ${size} bytes — moon build likely produced an empty / stub file`,
  );
  process.exit(1);
}

const content = modules.join("\n");

// Reject stray \x1f (Unit Separator). The MoonBit toolchain has been
// observed to leak this into emitted JS during wasm-host translation.
const usPositions = [];
for (let i = 0; i < content.length; i += 1) {
  if (content.charCodeAt(i) === 0x1f) {
    usPositions.push(i);
    if (usPositions.length >= 5) break;
  }
}
if (usPositions.length > 0) {
  console.error(
    `worker bundle check: ${usPositions.length}+ occurrence(s) of \\x1f in ${target} ` +
      `(first at offset ${usPositions[0]}). The bundle is corrupted — rebuild from a clean _build/.`,
  );
  process.exit(1);
}

// Each entry must appear somewhere in the bundle. Add one per code
// path you cannot afford to silently disappear (e.g. when adding a
// scheduled cron handler). Example pattern:
//   const REQUIRED_MARKERS = [
//     { needle: "globalThis.__appCronTick", reason: "scheduled cron forwarder" },
//   ];
const REQUIRED_MARKERS: Array<{ needle: string; reason: string }> = [];
for (const marker of REQUIRED_MARKERS) {
  if (!modules.some(module => module.includes(marker.needle))) {
    console.error(
      `worker bundle check: missing marker "${marker.needle}" (${marker.reason}) in ${target}. ` +
        `Either the upstream moon output changed shape or src/worker.ts dropped its import. ` +
        `Investigate before re-running the build.`,
    );
    process.exit(1);
  }
}

console.log(`worker bundle check: ok (${target})`);
