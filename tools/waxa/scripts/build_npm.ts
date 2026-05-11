#!/usr/bin/env -S deno run -A
/**
 * Build npm package via dnt. Outputs to ./npm.
 *
 *   deno task build:npm
 *   cd npm && npm publish --access public
 */
import { build, emptyDir } from "@deno/dnt";

const denoJson = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url)));
const version = denoJson.version as string;

await emptyDir("./npm");

await build({
  entryPoints: [{ kind: "bin", name: "waxa", path: "./src/cli.ts" }],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  package: {
    name: "@mizchi/waxa",
    version,
    description:
      "Skill evaluation CLI with the empirical-prompt-tuning iteration loop, structured self-report grader, LLM-as-Judge, and with_skill / without_skill baseline comparison. Inspired by microsoft/waza and agentskills.io.",
    license: "MIT",
    author: "mizchi",
    repository: {
      type: "git",
      url: "git+https://github.com/mizchi/skills.git",
      directory: "tools/waxa",
    },
    bugs: {
      url: "https://github.com/mizchi/skills/issues",
    },
    keywords: [
      "agent-skill",
      "eval",
      "waza",
      "llm-eval",
      "claude",
    ],
    engines: {
      node: ">=20",
    },
  },
  postBuild() {
    Deno.copyFileSync("README.md", "npm/README.md");
    try {
      Deno.copyFileSync("../../LICENSE.txt", "npm/LICENSE");
    } catch (_) {
      // Top-level repo may not have LICENSE.txt; ignore.
    }
    // Bundle empirical-prompt-tuning as a reference so the npm package
    // is methodologically self-contained — users running `npx
    // @mizchi/waxa` get the iter / convergence semantics on disk
    // alongside the CLI.
    try {
      Deno.mkdirSync("npm/references", { recursive: true });
      Deno.copyFileSync(
        "../../empirical-prompt-tuning/SKILL.md",
        "npm/references/empirical-prompt-tuning.md",
      );
    } catch (e) {
      console.warn("[warn] empirical-prompt-tuning not bundled:", e);
    }
  },
  test: false,
  // Type checking is done via `deno task check` against the source. The
  // dnt shim's Deno.* surface still trips ts-morph occasionally (12
  // diagnostics around dntShim.Deno.errors.NotSupported), so we skip
  // the duplicate compile-time pass here.
  typeCheck: false,
  // Top-level await in cli.ts means we ship ESM-only. CommonJS would
  // require splitting cli.ts into a library + a thin entry; not worth
  // it for a CLI binary.
  scriptModule: false,
});

console.log("\n[done] npm package built into ./npm");
console.log("Run 'cd npm && npm publish --access public' when ready.");
