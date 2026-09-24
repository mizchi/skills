import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  mergePersona,
  readMeasuredData,
  renderMeasured,
  summarizeIssues,
  summarizePulls,
  headingsOf,
  writingLanguage,
  type Measured,
  type Pull,
} from "./persona.ts";

const pull = (over: Partial<Pull>): Pull => ({
  number: 1,
  title: "fix: handle empty input",
  state: "MERGED",
  isDraft: false,
  authorAssociation: "CONTRIBUTOR",
  author: "alice",
  mergedBy: "maint",
  createdAt: "2026-01-01T00:00:00Z",
  closedAt: "2026-01-02T00:00:00Z",
  body: "## Summary\nfix\n\nCloses #3",
  reviewers: ["maint"],
  files: ["src/a.ts", "src/a.test.ts"],
  commitMessages: ["fix: handle empty input\n\nSigned-off-by: Alice <a@example.com>"],
  labels: ["bug"],
  closesIssues: 1,
  firstResponseAt: "2026-01-01T06:00:00Z",
  ...over,
});

test("summarizePulls counts conventions over merged PRs only", () => {
  const s = summarizePulls([
    pull({ number: 1 }),
    pull({ number: 2, title: "Handle empty input", body: "x", closesIssues: 0, files: ["src/b.ts"], commitMessages: ["Handle"] }),
    pull({ number: 3, state: "CLOSED", title: "feat: rejected" }),
  ]);
  assert.equal(s.merged, 2);
  assert.equal(s.closedUnmerged, 1);
  assert.equal(s.conventionalTitles, 1);
  assert.equal(s.closesIssue, 1);
  assert.equal(s.touchesTests, 1);
  assert.equal(s.signedOff, 1);
  assert.deepEqual(s.bodyChars, { median: 13, p90: 25 });
});

test("summarizePulls separates bot reviewers and counts self-merges", () => {
  const s = summarizePulls([
    pull({ author: "maint", mergedBy: "maint", reviewers: ["copilot-pull-request-reviewer[bot]", "maint"] }),
    pull({ reviewers: ["maint", "bob", "maint"] }),
  ]);
  assert.deepEqual(s.humanReviewers, [["maint", 2], ["bob", 1]]);
  assert.deepEqual(s.botReviewers, [["copilot-pull-request-reviewer[bot]", 1]]);
  assert.equal(s.selfMerged, 1);
});

test("summarizePulls reports outcome per author association", () => {
  const s = summarizePulls([
    pull({ authorAssociation: "FIRST_TIME_CONTRIBUTOR" }),
    pull({ authorAssociation: "FIRST_TIME_CONTRIBUTOR", state: "CLOSED", firstResponseAt: null }),
    pull({ authorAssociation: "MEMBER" }),
  ]);
  assert.deepEqual(s.byAssociation.FIRST_TIME_CONTRIBUTOR, { merged: 1, closedUnmerged: 1, noResponse: 1, firstResponseHoursMedian: 6 });
  assert.equal(s.byAssociation.MEMBER.merged, 1);
});

test("summarizePulls counts headings once per body", () => {
  const s = summarizePulls([
    pull({ body: "## Summary\n## Summary\n### Test plan" }),
    pull({ body: "## summary\nno test plan" }),
  ]);
  assert.deepEqual(s.headings, [["summary", 2], ["test plan", 1]]);
});

test("summarizeIssues measures length, headings and labels", () => {
  const s = summarizeIssues([
    { body: "## Steps\n1. run", labels: ["bug"] },
    { body: "short", labels: ["bug", "p1"] },
  ]);
  assert.equal(s.count, 2);
  assert.deepEqual(s.labels, [["bug", 2], ["p1", 1]]);
  assert.deepEqual(s.headings, [["steps", 1]]);
});

test("classify: outsider on a public repo with no merged PR is a first-time OSS contributor", () => {
  assert.deepEqual(classify({ visibility: "PUBLIC", viewerIsOrgMember: false, myPrs: 2, myMergedPrs: 0 }), {
    relation: "oss",
    standing: "first-time",
    exposure: "public",
  });
});

test("classify: org member is internal even on a public repo, and exposure stays public", () => {
  assert.deepEqual(classify({ visibility: "PUBLIC", viewerIsOrgMember: true, myPrs: 5, myMergedPrs: 3 }), {
    relation: "internal",
    standing: "returning",
    exposure: "public",
  });
});

test("classify: private repo is internal and private; an override wins", () => {
  assert.equal(classify({ visibility: "PRIVATE", viewerIsOrgMember: false, myPrs: 0, myMergedPrs: 0 }).relation, "internal");
  assert.equal(classify({ visibility: "INTERNAL", viewerIsOrgMember: true, myPrs: 0, myMergedPrs: 0 }).exposure, "private");
  assert.equal(
    classify({ visibility: "PUBLIC", viewerIsOrgMember: true, myPrs: 0, myMergedPrs: 0, relationOverride: "oss" }).relation,
    "oss",
  );
});

const measured = (): Measured => ({
  repo: "acme/widget",
  measuredAt: "2026-09-24",
  headSha: "0123456789abcdef",
  context: { relation: "oss", standing: "first-time", exposure: "public" },
  language: "en",
  viewer: "me",
  files: { contributing: "CONTRIBUTING.md", prTemplate: null, issueTemplates: [], codeowners: false },
  rules: ["pull_request: 1 approval"],
  pulls: summarizePulls([pull({})]),
  issues: summarizeIssues([{ body: "b", labels: [] }]),
});

test("renderMeasured embeds machine-readable data that readMeasuredData recovers", () => {
  const block = renderMeasured(measured());
  assert.match(block, /^<!-- maintainer-persona:measured:begin -->/);
  assert.match(block, /<!-- maintainer-persona:measured:end -->$/);
  assert.equal(readMeasuredData(block)?.repo, "acme/widget");
});

test("mergePersona creates a skeleton with hand-edited sections outside the block", () => {
  const doc = mergePersona(null, renderMeasured(measured()));
  assert.match(doc, /^# Persona: acme\/widget/);
  for (const h of ["## 1. Readers", "## 2. Vocabulary", "## 3. Needs translating", "## 6. Landmines"]) {
    assert.ok(doc.includes(h), h);
  }
});

test("mergePersona replaces only the measured block and keeps hand edits", () => {
  const first = mergePersona(null, renderMeasured(measured()));
  const edited = first.replace("## 6. Landmines\n", "## 6. Landmines\n\n- never mention the old API\n");
  const next = measured();
  next.headSha = "fedcba9876543210";
  const merged = mergePersona(edited, renderMeasured(next));
  assert.ok(merged.includes("never mention the old API"));
  assert.ok(merged.includes("fedcba9876543210"));
  assert.ok(!merged.includes("0123456789abcdef"));
});

test("mergePersona refuses a file whose markers were removed", () => {
  assert.throws(() => mergePersona("# Persona: acme/widget\n\nhand text only\n", renderMeasured(measured())), /markers/);
});

test("headingsOf truncates template-length headings", () => {
  const [h] = headingsOf(`## ${"please don't delete this checklist ".repeat(4)}`);
  assert.ok(h.length <= 61, h);
  assert.ok(h.endsWith("…"));
});

test("summarizePulls counts bodies written in Japanese", () => {
  const s = summarizePulls([pull({ body: "## 概要\n修正します" }), pull({ body: "## Summary" })]);
  assert.equal(s.japaneseBodies, 1);
});

test("writingLanguage decides from PR and issue bodies together", () => {
  assert.equal(writingLanguage(summarizePulls([pull({ body: "修正します" })]), summarizeIssues([{ body: "不具合です", labels: [] }])), "ja");
  assert.equal(writingLanguage(summarizePulls([pull({})]), summarizeIssues([{ body: "bug", labels: [] }])), "en");
  assert.equal(
    writingLanguage(summarizePulls([pull({}), pull({ body: "修正します" })]), summarizeIssues([{ body: "bug", labels: [] }, { body: "x", labels: [] }])),
    "mixed",
  );
});

test("kanji-only text is not taken as Japanese (it may be Chinese)", () => {
  assert.equal(summarizeIssues([{ body: "修复错误", labels: [] }]).japaneseBodies, 0);
});
