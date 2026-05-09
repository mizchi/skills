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
      "Skill evaluation CLI — waza-schema-compatible runner with empirical-prompt-tuning iteration loop, structured self-report grader, and LLM-as-Judge.",
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
  },
  test: false,
  typeCheck: "single",
});

console.log("\n[done] npm package built into ./npm");
console.log("Run 'cd npm && npm publish --access public' when ready.");
