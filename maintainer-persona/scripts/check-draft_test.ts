import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDraft, findRepoRefs } from "./check-draft.ts";

test("findRepoRefs collects URL, owner/repo#N and backticked owner/repo references with their form", () => {
  const refs = findRepoRefs(
    "See https://github.com/acme/secret-infra/pull/4 and acme/tools#12.\nAlso `acme/widget` and a path src/a.ts",
  );
  assert.deepEqual(refs, [
    { repo: "acme/secret-infra", form: "url" },
    { repo: "acme/tools", form: "hash" },
    { repo: "acme/widget", form: "tick" },
  ]);
});

test("findRepoRefs ignores file paths and dates", () => {
  assert.deepEqual(findRepoRefs("edit src/lib.rs and docs/guide.md on 2026/09"), []);
});

const base = {
  target: "acme/widget",
  kind: "issue" as const,
  exposure: "public" as const,
  refVisibility: new Map<string, string | null>([["acme/widget", "PUBLIC"]]),
  bodyP90: 1000,
  language: "en" as const,
};

test("a public target fails on a reference the reader cannot open", () => {
  const r = evaluateDraft({
    ...base,
    text: "Found while working on acme/secret-infra#4.",
    refVisibility: new Map([["acme/secret-infra", "PRIVATE"]]),
  });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /acme\/secret-infra/);
});

test("an unresolvable URL or #N reference counts as unreadable", () => {
  const r = evaluateDraft({ ...base, text: "see ghost/repo#1", refVisibility: new Map([["ghost/repo", null]]) });
  assert.equal(r.errors.length, 1);
});

test("an unresolvable backticked a/b is a branch or path, not a repository", () => {
  const r = evaluateDraft({
    ...base,
    text: "the `feature/expand_size` branch",
    refVisibility: new Map([["feature/expand_size", null]]),
  });
  assert.deepEqual(r.errors, []);
});

test("a backticked private repository is still an error on a public target", () => {
  const r = evaluateDraft({
    ...base,
    text: "copied from `acme/secret-infra`",
    refVisibility: new Map([["acme/secret-infra", "PRIVATE"]]),
  });
  assert.equal(r.errors.length, 1);
});

test("a private target only warns on private references outside its own owner", () => {
  const r = evaluateDraft({
    ...base,
    exposure: "private",
    text: "acme/infra#1 and other/thing#2",
    refVisibility: new Map([
      ["acme/infra", "PRIVATE"],
      ["other/thing", "PRIVATE"],
    ]),
  });
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /other\/thing/);
});

test("a body longer than the p90 for its kind warns with both numbers and the kind", () => {
  const r = evaluateDraft({ ...base, text: "x".repeat(1500), bodyP90: 1000 });
  assert.equal(r.errors.length, 0);
  assert.match(r.warnings[0], /1500.*issue.*1000/);
});

test("evidence inside <details> does not count toward the length", () => {
  const r = evaluateDraft({ ...base, text: "short<details>" + "x".repeat(1500) + "</details>", bodyP90: 1000 });
  assert.deepEqual(r.warnings, []);
});

test("a draft in the wrong language for its kind warns", () => {
  assert.match(evaluateDraft({ ...base, text: "リンクが切れています" }).warnings[0], /Japanese.*en/);
  assert.match(evaluateDraft({ ...base, language: "ja", text: "The link is broken" }).warnings[0], /no Japanese.*ja/);
  assert.deepEqual(evaluateDraft({ ...base, language: "mixed", text: "The link is broken" }).warnings, []);
});

test("a passing check still reports what it checked", () => {
  const r = evaluateDraft({ ...base, text: "See acme/widget#1. The link is broken." });
  assert.deepEqual(r.errors, []);
  assert.match(r.summary, /visible 38\/1000 chars \(issue p90\), language en ok, 0 other repository references/);
});
