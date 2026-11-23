#!/usr/bin/env node
// Check a repository against the OSS release policy in ../references/release-policy.md.
//
//   node release-policy.mjs [dir] [--as <version>] [--json]
//
// 0.0.x is a prototype: gaps are listed as "todo" and the exit code stays 0.
// From 0.1.0 a missing requirement is a failure (exit 1). `--as 0.1.0` answers
// "what is left before this prototype can become 0.1.0?".
//
// The checks read files only. Workflow and TOML files are matched with
// patterns, not parsed, so treat a pass as "the expected piece is present",
// not as proof that the release works.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const README_MAX_LINES = 200;
const JAPANESE_MAX_RATIO = 0.1;

const LICENSE_NAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE-MIT", "LICENSE-APACHE"];
const CONTRIBUTING_NAMES = ["CONTRIBUTING.md", "CONTRIBUTE.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"];
const CLIFF_NAMES = ["cliff.toml", ".cliff.toml", ".config/cliff.toml"];
const MISE_NAMES = ["mise.toml", ".mise.toml", "mise/config.toml", ".config/mise.toml"];
const RUST_TOOLCHAIN_NAMES = ["rust-toolchain.toml", "rust-toolchain"];
const ROOT_FILES = ["package.json", "Cargo.toml", "README.md", "CHANGELOG.md", ".changeset/config.json", "release-please-config.json", ...LICENSE_NAMES, ...CONTRIBUTING_NAMES, ...CLIFF_NAMES, ...MISE_NAMES, ...RUST_TOOLCHAIN_NAMES];
const MIN_NODE_MAJOR = 24;
const MIN_PNPM_MAJOR = 12;
const DIRS = [
  [".github/workflows", /\.ya?ml$/],
  [".github/releases", /\.md$/],
];

/** Read the files the policy looks at into a { relativePath: content } map. */
export function collectFiles(dir) {
  const files = {};
  const add = (rel) => {
    const path = join(dir, rel);
    if (existsSync(path) && statSync(path).isFile()) files[rel] = readFileSync(path, "utf8");
  };
  ROOT_FILES.forEach(add);
  for (const [sub, pattern] of DIRS) {
    const path = join(dir, sub);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path)) if (pattern.test(name)) add(`${sub}/${name}`);
  }
  return files;
}

export function stageOf(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (!m) throw new Error(`cannot read a semver version from "${version}"`);
  return m[1] === "0" && m[2] === "0" ? "prototype" : "public";
}

const stripFences = (text) => text.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, "");

/** Share of Japanese characters in the prose (fenced code removed). */
export function japaneseRatio(text) {
  const prose = stripFences(text).replace(/\s/g, "");
  if (prose.length === 0) return 0;
  const japanese = prose.match(/[぀-ヿ㐀-䶿一-鿿]/g)?.length ?? 0;
  return japanese / prose.length;
}

export function licenseKind(text) {
  const head = text.slice(0, 600);
  if (/Apache License/i.test(head) && /Version 2\.0/i.test(head)) return "Apache-2.0";
  if (/\bMIT License\b/i.test(head) || /Permission is hereby granted, free of charge/i.test(head)) return "MIT";
  return "other";
}

/** Split markdown into sections by ATX heading; fenced code never starts a section. */
function sections(markdown) {
  const out = [{ level: 0, title: "", body: "" }];
  let fence = null;
  for (const line of markdown.split("\n")) {
    const f = /^(```|~~~)/.exec(line);
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence;
    const h = fence === null && !f ? /^(#{1,6})\s+(.*?)\s*#*$/.exec(line) : null;
    if (h) out.push({ level: h[1].length, title: h[2], body: "" });
    else out.at(-1).body += line + "\n";
  }
  return out;
}

const hasFence = (text) => /^(```|~~~)/m.test(text);
// A line of prose: not an image, badge row, link-only navigation, HTML or blockquote.
const hasProse = (text) =>
  stripFences(text)
    .split("\n")
    .some((l) => /[A-Za-z぀-鿿]{3}/.test(l.replace(/!?\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]+>/g, "")));

function manifest(files) {
  if (files["package.json"]) {
    const pkg = JSON.parse(files["package.json"]);
    return { kind: "npm", pkg, version: pkg.version, license: pkg.license, publishes: pkg.private !== true };
  }
  if (files["Cargo.toml"]) {
    const toml = files["Cargo.toml"];
    return { kind: "cargo", pkg: null, version: /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1], license: /^license\s*=\s*"([^"]+)"/m.exec(toml)?.[1], publishes: false };
  }
  return { kind: "none", pkg: null, version: undefined, license: undefined, publishes: false };
}

function changelogGenerator(files, pkg) {
  const cliff = CLIFF_NAMES.map((n) => files[n]).find((c) => c !== undefined);
  const scripts = Object.values(pkg?.scripts ?? {}).join("\n");
  const deps = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies });
  if (cliff !== undefined) return { name: "git-cliff", credits: /remote\.username|github\.contributors/.test(cliff) };
  if (/git-cliff/.test(scripts)) return { name: "git-cliff", credits: false };
  if (files[".changeset/config.json"]) return { name: "changesets", credits: /changelog-github/.test(files[".changeset/config.json"]) };
  if (files["release-please-config.json"]) return { name: "release-please", credits: false };
  if (deps.includes("conventional-changelog") || /conventional-changelog/.test(scripts)) return { name: "conventional-changelog", credits: false };
  return null;
}

/**
 * Evaluate the policy. `files` is the map from collectFiles; `version`
 * overrides the manifest version (the --as flag).
 * Status: pass | fail (required, 0.1.0+) | todo (required, 0.0.x) | warn (recommended) | skip.
 */
export function evaluate({ files, version: asVersion }) {
  const m = manifest(files);
  const version = asVersion ?? m.version;
  if (!version) throw new Error("no version found: add package.json or Cargo.toml, or pass --as <version>");
  const stage = stageOf(version);
  const results = [];
  const required = (id, ok, message) => results.push({ id, status: ok ? "pass" : stage === "public" ? "fail" : "todo", message });
  const recommended = (id, ok, message) => results.push({ id, status: ok ? "pass" : "warn", message });
  const skip = (id, message) => results.push({ id, status: "skip", message });

  // License
  const licenses = LICENSE_NAMES.filter((n) => files[n] !== undefined).map((n) => licenseKind(files[n]));
  required("license.file", licenses.length > 0, "LICENSE with the full license text exists");
  if (licenses.length > 0) {
    recommended("license.preferred", licenses.every((k) => k !== "other"), "license is MIT or Apache-2.0 (preferred for new projects; keep an established license)");
    if (m.kind === "none") skip("license.manifest", "no manifest to compare");
    else {
      const declared = String(m.license ?? "").split(/\s+OR\s+|\//i).map((s) => s.replace(/[()]/g, "").trim()).sort();
      const found = [...new Set(licenses)].sort();
      const ok = found.includes("other") ? Boolean(m.license) : declared.join() === found.join();
      required("license.manifest", ok, `manifest license (${m.license ?? "unset"}) matches LICENSE (${found.join(" + ")})`);
    }
  }

  // README
  const readme = files["README.md"];
  required("readme.exists", readme !== undefined, "README.md exists");
  if (readme !== undefined) {
    const secs = sections(readme);
    const intro = secs.filter((s, i) => i < Math.max(secs.findIndex((x) => x.level >= 2), 0) || secs.every((x) => x.level < 2));
    const titled = (re) => secs.filter((s) => s.level >= 2 && re.test(s.title));
    const quick = titled(/quick\s*start|getting started|usage|at a glance|example/i);
    const dev = titled(/^(development|developing|dev(elopment)? setup|local setup|building|build(ing)? from source|hacking)\b/i);
    required("readme.english", japaneseRatio(readme) < JAPANESE_MAX_RATIO, "README.md is written in English (Japanese goes in README.ja.md or docs/ as a supplement)");
    required("readme.purpose", secs.some((s) => s.level === 1) && intro.some((s) => hasProse(s.body)), "README opens with a title and a sentence saying what the project is for");
    required("readme.install", titled(/install/i).length > 0, "README has an Installation section for users");
    required("readme.quickstart", quick.some((s) => hasFence(s.body)), "README has a Quick Start (or Usage) section with a runnable example");
    required("readme.example", hasFence(readme), "README shows at least one code example");
    required("readme.license", titled(/licen[sc]e/i).length > 0 || /\]\(\.?\/?LICENSE/.test(readme), "README names the license");
    recommended("readme.contributing", /CONTRIBUT(ING|E)\.md/.test(readme), "README links to the contribution guide");
    const lines = readme.trimEnd().split("\n").length;
    recommended("readme.length", lines <= README_MAX_LINES, `README is ${lines} lines (limit ${README_MAX_LINES}); move reference and advanced material to docs/ and link it`);
    recommended("readme.dev-setup", dev.every((s) => !hasFence(s.body) && s.body.trim().split("\n").length <= 3), "development setup lives in CONTRIBUTING.md; the README only links to it");
  }

  // Contribution guide
  const contributing = CONTRIBUTING_NAMES.map((n) => files[n]).find((c) => c !== undefined);
  required("contributing.exists", contributing !== undefined, "CONTRIBUTING.md exists");
  if (contributing !== undefined) {
    required("contributing.english", japaneseRatio(contributing) < JAPANESE_MAX_RATIO, "CONTRIBUTING.md is written in English");
    required("contributing.setup", hasFence(contributing) || /`[^`\n]*\s[^`\n]*`/.test(contributing), "CONTRIBUTING.md gives the setup and check commands");
  }

  // CI and tag release
  const workflows = Object.entries(files).filter(([p]) => p.startsWith(".github/workflows/")).map(([, c]) => c);
  const tagWorkflows = workflows.filter((w) => /^\s*tags:/m.test(w));
  const release = tagWorkflows.join("\n");
  required("ci.workflow", workflows.some((w) => /\bpull_request\b/.test(w)), "a GitHub Actions workflow runs on pull requests");
  required("release.tag-workflow", tagWorkflows.length > 0, "a workflow runs on version tag push");
  if (tagWorkflows.length > 0) required("release.github-release", /gh release create|action-gh-release|release-action/.test(release), "the tag workflow creates the GitHub Release page");
  if (m.publishes) {
    required("release.npm-publish", /\b(npm|pnpm) publish\b/.test(release), "the tag workflow publishes to npm");
    required("release.package-fields", Boolean(m.pkg.repository), "package.json has repository (provenance is verified against it)");
    recommended("release.npm-oidc", /id-token:\s*write/.test(release) && !/NPM_TOKEN|NODE_AUTH_TOKEN/.test(release), "npm publish uses OIDC trusted publishing, not a stored token");
  } else {
    for (const id of ["release.npm-publish", "release.package-fields", "release.npm-oidc"]) skip(id, m.kind === "npm" ? "package.json is private" : "no npm package");
  }
  recommended("release.summary", files[`.github/releases/v${String(version).replace(/^v/, "")}.md`] !== undefined, `.github/releases/v${String(version).replace(/^v/, "")}.md holds the release page summary for this version`);

  // Changelog
  const generator = changelogGenerator(files, m.pkg);
  required("changelog.generator", generator !== null, `CHANGELOG.md is generated${generator ? ` (${generator.name})` : " (no git-cliff / changesets / release-please / conventional-changelog setup found)"}`);
  if (generator !== null) required("changelog.contributors", generator.credits, "the changelog generator credits contributors by name");
  required("changelog.file", files["CHANGELOG.md"] !== undefined, "CHANGELOG.md exists");

  // Toolchain versions: Node.js and pnpm pinned with mise, Rust with rust-toolchain.toml
  const mise = MISE_NAMES.map((n) => files[n]).find((c) => c !== undefined);
  const toolVersion = (name) => mise?.match(new RegExp(`^\\s*${name}\\s*=\\s*["']([^"']+)["']`, "m"))?.[1];
  const major = (v) => (/^\d+/.test(v ?? "") ? Number(v.match(/^\d+/)[0]) : NaN);
  if (files["package.json"] !== undefined) {
    const node = toolVersion("node");
    const pnpm = toolVersion("pnpm");
    const declared = /^pnpm@(.+)$/.exec(m.pkg?.packageManager ?? "")?.[1];
    const ok = major(node) >= MIN_NODE_MAJOR && major(pnpm) >= MIN_PNPM_MAJOR && (declared === undefined || declared === pnpm);
    recommended("toolchain.node", ok, `mise.toml pins Node.js ${MIN_NODE_MAJOR}+ and pnpm ${MIN_PNPM_MAJOR}+ to versions (node ${node ?? "unset"}, pnpm ${pnpm ?? "unset"}${declared ? `, packageManager pnpm@${declared}` : ""})`);
  } else skip("toolchain.node", "no package.json");
  if (files["Cargo.toml"] !== undefined) {
    const toolchain = RUST_TOOLCHAIN_NAMES.map((n) => files[n]).find((c) => c !== undefined);
    const channel = toolchain?.match(/^\s*channel\s*=\s*["']([^"']+)["']/m)?.[1] ?? toolchain?.trim().split("\n")[0];
    recommended("toolchain.rust", /^\d+\.\d+(\.\d+)?$|^nightly-\d{4}-\d{2}-\d{2}$/.test(channel ?? ""), `rust-toolchain.toml pins the Rust channel to a version (${channel ?? "missing"})`);
  } else skip("toolchain.rust", "no Cargo.toml");
  if (mise !== undefined) {
    const repeats = workflows.some((w) => /node-version:|pnpm\/action-setup|install (--global|-g) pnpm@/.test(w));
    recommended("toolchain.ci", !repeats, "workflows install tools from mise.toml (jdx/mise-action), not versions of their own");
  } else skip("toolchain.ci", "no mise.toml");

  return { version, stage, ok: results.every((r) => r.status !== "fail"), results };
}

const MARK = { pass: "ok  ", fail: "FAIL", todo: "todo", warn: "warn", skip: "skip" };

export function format(report) {
  const lines = [`version ${report.version} (${report.stage === "prototype" ? "0.0.x prototype: nothing is enforced yet" : "0.1.0+: requirements are enforced"})`, ""];
  for (const r of report.results) lines.push(`${MARK[r.status]}  ${r.id.padEnd(24)} ${r.message}`);
  const count = (s) => report.results.filter((r) => r.status === s).length;
  lines.push("", `${count("fail")} failed, ${count("todo")} todo before 0.1.0, ${count("warn")} warnings`);
  return lines.join("\n");
}

export function main(argv, log = console.log) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { as: { type: "string" }, json: { type: "boolean" } } });
  const report = evaluate({ files: collectFiles(positionals[0] ?? "."), version: values.as });
  log(values.json ? JSON.stringify(report, null, 2) : format(report));
  return report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`release-policy: ${error.message}`);
    process.exitCode = 2;
  }
}
