import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { collectFiles, evaluate, japaneseRatio, licenseKind, main, stageOf } from "./release-policy.mjs";

const MIT = "MIT License\n\nCopyright (c) 2026 Example\n\nPermission is hereby granted, free of charge, to any person obtaining a copy";
const README = `# example-lines

Split Unix or Windows text into lines while preserving empty lines.

## Installation

\`\`\`sh
pnpm add example-lines
\`\`\`

## Quick Start

\`\`\`js
import { lines } from "example-lines";
\`\`\`

See [Contributing](CONTRIBUTING.md).

## License

[MIT](LICENSE)
`;
const CI = "name: CI\non: [push, pull_request]\njobs:\n  check:\n    runs-on: ubuntu-latest\n";
const RELEASE = `name: release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    permissions:
      contents: write
      id-token: write
    steps:
      - run: npm publish --access public
      - run: gh release create "$GITHUB_REF_NAME" --notes-file notes.md
`;
const MISE = '[tools]\nnode = "24.11.0"\npnpm = "12.22.0"\n';
const CLIFF = '[changelog]\nbody = """{% if commit.remote.username %} by @{{ commit.remote.username }}{% endif %}"""\n';

function project(overrides = {}) {
  const files = {
    "package.json": JSON.stringify({
      name: "example-lines",
      version: "0.1.0",
      license: "MIT",
      repository: { type: "git", url: "git+https://github.com/example/example-lines.git" },
      scripts: { changelog: "git-cliff -o CHANGELOG.md" },
    }),
    LICENSE: MIT,
    "README.md": README,
    "CONTRIBUTING.md": "# Contributing\n\nRun `pnpm check` before opening a pull request.\n",
    "CHANGELOG.md": "# Changelog\n\n## 0.1.0 (2026-11-21)\n",
    "cliff.toml": CLIFF,
    ".github/workflows/ci.yml": CI,
    ".github/workflows/release.yml": RELEASE,
    ".github/releases/v0.1.0.md": "# 0.1.0\n",
    "mise.toml": MISE,
    ...overrides,
  };
  for (const [k, v] of Object.entries(files)) if (v === undefined) delete files[k];
  return files;
}

const statusOf = (report, id) => report.results.find((r) => r.id === id)?.status;

test("stageOf splits at 0.1.0", () => {
  assert.equal(stageOf("0.0.1"), "prototype");
  assert.equal(stageOf("0.0.42"), "prototype");
  assert.equal(stageOf("0.1.0"), "public");
  assert.equal(stageOf("0.1.0-rc.0"), "public");
  assert.equal(stageOf("v1.2.3"), "public");
  assert.throws(() => stageOf("latest"), /version/);
});

test("japaneseRatio ignores fenced code and separates English from Japanese prose", () => {
  assert.ok(japaneseRatio("Split text into lines.\n\n日本語: [README.ja.md](README.ja.md)") < 0.1);
  assert.ok(japaneseRatio("# 行分割\n\nテキストを行に分割します。空行は保持されます。") > 0.5);
  assert.equal(japaneseRatio("Plain English.\n\n```js\n// 日本語のコメントだけ\n```\n"), 0);
});

test("licenseKind recognizes MIT, Apache-2.0 and everything else", () => {
  assert.equal(licenseKind(MIT), "MIT");
  assert.equal(licenseKind("                                 Apache License\n                           Version 2.0, January 2004"), "Apache-2.0");
  assert.equal(licenseKind("GNU GENERAL PUBLIC LICENSE\nVersion 3"), "other");
});

test("a complete 0.1.0 project has no failures or warnings", () => {
  const report = evaluate({ files: project() });
  assert.equal(report.stage, "public");
  assert.deepEqual(report.results.filter((r) => r.status === "fail" || r.status === "warn"), []);
  assert.equal(report.ok, true);
});

test("at 0.1.0, each missing requirement fails on its own check", () => {
  const cases = [
    [{ LICENSE: undefined }, "license.file"],
    [{ "README.md": undefined }, "readme.exists"],
    [{ "README.md": "# 行分割\n\nテキストを行に分割します。空行は保持されます。\n\n## Installation\n\n## Usage\n" }, "readme.english"],
    [{ "README.md": README.replace("Split Unix or Windows text into lines while preserving empty lines.\n", "") }, "readme.purpose"],
    [{ "README.md": README.replace("## Installation", "## Setup notes") }, "readme.install"],
    [{ "README.md": README.replace("## Quick Start", "## Misc") }, "readme.quickstart"],
    [{ "README.md": README.replace(/```[\s\S]*?```/g, "") }, "readme.example"],
    [{ "README.md": README.replace("## License\n\n[MIT](LICENSE)\n", "") }, "readme.license"],
    [{ "CONTRIBUTING.md": undefined }, "contributing.exists"],
    [{ "CONTRIBUTING.md": "# コントリビュート\n\nプルリクエストの前に pnpm check を実行してください。" }, "contributing.english"],
    [{ ".github/workflows/ci.yml": undefined }, "ci.workflow"],
    [{ ".github/workflows/release.yml": undefined }, "release.tag-workflow"],
    [{ ".github/workflows/release.yml": RELEASE.replace(/.*gh release create.*\n/, "") }, "release.github-release"],
    [{ ".github/workflows/release.yml": RELEASE.replace(/.*npm publish.*\n/, "") }, "release.npm-publish"],
    [{ "CHANGELOG.md": undefined }, "changelog.file"],
    [{ "cliff.toml": undefined, "package.json": JSON.stringify({ version: "0.1.0", license: "MIT", repository: "x" }) }, "changelog.generator"],
    [{ "cliff.toml": "[changelog]\nbody = \"\"\"{{ commit.message }}\"\"\"\n" }, "changelog.contributors"],
  ];
  for (const [overrides, id] of cases) {
    const report = evaluate({ files: project(overrides) });
    assert.equal(statusOf(report, id), "fail", id);
    assert.equal(report.ok, false, id);
  }
});

test("a 0.0.x prototype reports the same gaps as todo and still passes", () => {
  const files = { "package.json": JSON.stringify({ name: "x", version: "0.0.3" }), "README.md": "# x\n" };
  const report = evaluate({ files });
  assert.equal(report.stage, "prototype");
  assert.equal(report.ok, true);
  assert.equal(statusOf(report, "contributing.exists"), "todo");
  assert.equal(statusOf(report, "ci.workflow"), "todo");
  assert.equal(report.results.some((r) => r.status === "fail"), false);
});

test("--as evaluates a prototype against the 0.1.0 gate", () => {
  const files = { "package.json": JSON.stringify({ name: "x", version: "0.0.3" }), "README.md": "# x\n" };
  const report = evaluate({ files, version: "0.1.0" });
  assert.equal(report.stage, "public");
  assert.equal(report.ok, false);
  assert.equal(statusOf(report, "contributing.exists"), "fail");
});

test("a license outside MIT / Apache-2.0 is a warning, a manifest mismatch is a failure", () => {
  const gpl = evaluate({ files: project({ LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3", "package.json": JSON.stringify({ version: "0.1.0", license: "GPL-3.0-only", repository: "x", scripts: { changelog: "git-cliff" } }) }) });
  assert.equal(statusOf(gpl, "license.preferred"), "warn");
  assert.equal(gpl.ok, true);

  const mismatch = evaluate({ files: project({ "package.json": JSON.stringify({ version: "0.1.0", license: "ISC", repository: "x" }) }) });
  assert.equal(statusOf(mismatch, "license.manifest"), "fail");

  const dual = evaluate({ files: project({ LICENSE: undefined, "LICENSE-MIT": MIT, "LICENSE-APACHE": "Apache License\nVersion 2.0, January 2004", "package.json": JSON.stringify({ version: "0.1.0", license: "MIT OR Apache-2.0", repository: "x" }) }) });
  assert.equal(statusOf(dual, "license.preferred"), "pass");
  assert.equal(statusOf(dual, "license.manifest"), "pass");
});

test("a private package skips npm checks but still needs a tag release", () => {
  const pkg = JSON.stringify({ version: "0.1.0", license: "MIT", private: true });
  const report = evaluate({ files: project({ "package.json": pkg, ".github/workflows/release.yml": RELEASE.replace(/.*npm publish.*\n/, "") }) });
  assert.equal(statusOf(report, "release.npm-publish"), "skip");
  assert.equal(statusOf(report, "release.package-fields"), "skip");
  assert.equal(statusOf(report, "release.tag-workflow"), "pass");
  assert.equal(report.ok, true);
});

test("token-based publishing and a missing release summary are warnings", () => {
  const report = evaluate({
    files: project({
      ".github/workflows/release.yml": RELEASE.replace("id-token: write", "") + "        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n",
      ".github/releases/v0.1.0.md": undefined,
    }),
  });
  assert.equal(statusOf(report, "release.npm-oidc"), "warn");
  assert.equal(statusOf(report, "release.summary"), "warn");
  assert.equal(report.ok, true);
});

test("Quick Start needs something runnable and CONTRIBUTING needs setup commands", () => {
  const noCode = evaluate({ files: project({ "README.md": README.replace(/## Quick Start\n\n```js[\s\S]*?```\n/, "## Quick Start\n\nImport it and call it.\n") }) });
  assert.equal(statusOf(noCode, "readme.quickstart"), "fail");

  const noSetup = evaluate({ files: project({ "CONTRIBUTING.md": "# Contributing\n\nPlease be kind and open a pull request.\n" }) });
  assert.equal(statusOf(noSetup, "contributing.setup"), "fail");
});

test("a long README or development setup in the README is a warning", () => {
  const long = evaluate({ files: project({ "README.md": README + "\nMore detail.\n".repeat(200) }) });
  assert.equal(statusOf(long, "readme.length"), "warn");
  assert.equal(long.ok, true);

  const dev = evaluate({ files: project({ "README.md": README + "\n## Development\n\n```sh\npnpm install\npnpm test\n```\n" }) });
  assert.equal(statusOf(dev, "readme.dev-setup"), "warn");

  const pointer = evaluate({ files: project({ "README.md": README + "\n## Development\n\nSee [CONTRIBUTING.md](CONTRIBUTING.md).\n" }) });
  assert.equal(statusOf(pointer, "readme.dev-setup"), "pass");
});

test("a Rust workspace reads its version from Cargo.toml", () => {
  const files = project({ "package.json": undefined, "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nversion = "0.2.0"\nlicense = "MIT"\n' });
  const report = evaluate({ files });
  assert.equal(report.version, "0.2.0");
  assert.equal(statusOf(report, "release.npm-publish"), "skip");
});

test("Node.js 24+ and pnpm 12+ are pinned in mise.toml, matching packageManager", () => {
  const pkg = (extra) => JSON.stringify({ ...JSON.parse(project()["package.json"]), ...extra });
  assert.equal(statusOf(evaluate({ files: project() }), "toolchain.node"), "pass");
  assert.equal(statusOf(evaluate({ files: project({ "mise.toml": undefined }) }), "toolchain.node"), "warn");
  assert.equal(statusOf(evaluate({ files: project({ "mise.toml": '[tools]\nnode = "22.12.0"\npnpm = "12.22.0"\n' }) }), "toolchain.node"), "warn");
  assert.equal(statusOf(evaluate({ files: project({ "mise.toml": '[tools]\nnode = "24"\npnpm = "11.0.0"\n' }) }), "toolchain.node"), "warn");
  assert.equal(statusOf(evaluate({ files: project({ "mise.toml": '[tools]\nnode = "lts"\npnpm = "12.22.0"\n' }) }), "toolchain.node"), "warn");
  assert.equal(statusOf(evaluate({ files: project({ "package.json": pkg({ packageManager: "pnpm@12.22.0" }) }) }), "toolchain.node"), "pass");
  assert.equal(statusOf(evaluate({ files: project({ "package.json": pkg({ packageManager: "pnpm@12.21.0" }) }) }), "toolchain.node"), "warn");
});

test("a Rust workspace pins its toolchain in rust-toolchain.toml", () => {
  const cargo = '[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nversion = "0.2.0"\nlicense = "MIT"\n';
  const rust = (extra) => evaluate({ files: project({ "package.json": undefined, "Cargo.toml": cargo, ...extra }) });
  assert.equal(statusOf(rust({}), "toolchain.rust"), "warn");
  assert.equal(statusOf(rust({ "rust-toolchain.toml": '[toolchain]\nchannel = "1.99.0"\n' }), "toolchain.rust"), "pass");
  assert.equal(statusOf(rust({ "rust-toolchain.toml": '[toolchain]\nchannel = "stable"\n' }), "toolchain.rust"), "warn");
  assert.equal(statusOf(rust({}), "toolchain.node"), "skip");
  assert.equal(statusOf(evaluate({ files: project() }), "toolchain.rust"), "skip");
});

test("CI installs the pinned tools from mise.toml instead of repeating versions", () => {
  const setupNode = CI + "    steps:\n      - uses: actions/setup-node@v6\n        with:\n          node-version: 24\n      - run: npm install --global pnpm@12.22.0\n";
  const mise = CI + "    steps:\n      - uses: jdx/mise-action@v5\n";
  assert.equal(statusOf(evaluate({ files: project({ ".github/workflows/ci.yml": setupNode }) }), "toolchain.ci"), "warn");
  assert.equal(statusOf(evaluate({ files: project({ ".github/workflows/ci.yml": mise }) }), "toolchain.ci"), "pass");
  assert.equal(statusOf(evaluate({ files: project({ "mise.toml": undefined }) }), "toolchain.ci"), "skip");
});

for (const name of ["example-project", "example-rust-project"]) {
  test(`the ${name} template satisfies the 0.1.0 policy`, () => {
    const dir = fileURLToPath(new URL(`../assets/${name}/`, import.meta.url));
    const report = evaluate({ files: collectFiles(dir) });
    assert.equal(report.stage, "public");
    assert.deepEqual(report.results.filter((r) => r.status === "fail" || r.status === "warn"), []);
  });
}

test("the CLI takes the directory as the first argument and --as in any position", () => {
  const dir = fileURLToPath(new URL("../assets/example-project/", import.meta.url));
  const out = [];
  assert.equal(main([dir], (line) => out.push(line)), 0);
  assert.match(out[0], /^version 0\.1\.0 /);
  assert.equal(main(["--as", "1.0.0", dir, "--json"], (line) => out.push(line)), 0);
  assert.equal(JSON.parse(out[1]).version, "1.0.0");
});
