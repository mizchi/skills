import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDraft, findRepoRefs } from "./check-draft.ts";

test("findRepoRefs collects URL, owner/repo#N and backticked owner/repo references", () => {
  const refs = findRepoRefs(
    "See https://github.com/acme/secret-infra/pull/4 and acme/tools#12.\nAlso `acme/widget` and a path src/a.ts",
  );
  assert.deepEqual(refs, ["acme/secret-infra", "acme/tools", "acme/widget"]);
});

test("findRepoRefs ignores file paths and dates", () => {
  assert.deepEqual(findRepoRefs("edit src/lib.rs and docs/guide.md on 2026/09"), []);
});

const base = {
  target: "acme/widget",
  exposure: "public" as const,
  refVisibility: new Map<string, string | null>([["acme/widget", "PUBLIC"]]),
  bodyP90: 1000,
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

test("an unresolvable reference counts as unreadable", () => {
  const r = evaluateDraft({ ...base, text: "see ghost/repo#1", refVisibility: new Map([["ghost/repo", null]]) });
  assert.equal(r.errors.length, 1);
});

test("a private target only warns on private references outside its own owner", () => {
  const r = evaluateDraft({
    ...base,
    target: "acme/widget",
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

test("a body longer than the measured p90 warns with both numbers", () => {
  const r = evaluateDraft({ ...base, text: "x".repeat(1500), bodyP90: 1000 });
  assert.equal(r.errors.length, 0);
  assert.match(r.warnings[0], /1500.*1000/);
});
