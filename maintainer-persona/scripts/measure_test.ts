import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusFiles, firstTimeQueries, parseArgs, toPull } from "./measure.ts";

const actor = (login: string, bot = false) => ({ login, __typename: bot ? "Bot" : "User" });
const raw = (over: Record<string, unknown> = {}) => ({
  number: 1, title: "t", state: "MERGED", isDraft: false, authorAssociation: "NONE",
  createdAt: "2026-01-01T00:00:00Z", closedAt: null, body: null,
  author: actor("alice"), mergedBy: actor("maint"),
  reviews: { nodes: [{ author: actor("maint"), submittedAt: "2026-01-01T05:00:00Z" }] },
  comments: { nodes: [
    { author: actor("changeset-bot", true), createdAt: "2026-01-01T00:01:00Z" },
    { author: actor("alice"), createdAt: "2026-01-01T00:02:00Z" },
  ] },
  files: { nodes: [] }, commits: { nodes: [] }, labels: { nodes: [] }, closingIssuesReferences: { totalCount: 0 },
  timelineItems: { nodes: [] },
  ...over,
});

test("toPull takes the first human response that is not the author", () => {
  const p = toPull(raw() as any);
  assert.equal(p.firstResponseAt, "2026-01-01T05:00:00Z");
  assert.equal(p.body, "");
});

test("toPull keeps bot reviewers, marked, in the reviewer list", () => {
  const p = toPull(raw({ reviews: { nodes: [{ author: actor("copilot-pull-request-reviewer", true), submittedAt: "2026-01-01T00:03:00Z" }] } }) as any);
  assert.deepEqual(p.reviewers, ["copilot-pull-request-reviewer[bot]"]);
  assert.equal(p.firstResponseAt, null);
});

test("parseArgs defaults the persona path under personas/<owner>/<repo>.md", () => {
  assert.equal(parseArgs(["acme/widget"]).out, "personas/acme/widget.md");
  assert.equal(parseArgs(["acme/widget", "--corpus", "c"]).corpus, "c");
  assert.throws(() => parseArgs(["acme/widget", "--relation", "friend"]), /relation/);
});

test("corpusFiles splits merged PR bodies and issue bodies by kind", () => {
  const files = corpusFiles(
    [
      { number: 7, state: "MERGED", body: "pr body" },
      { number: 8, state: "CLOSED", body: "rejected" },
      { number: 9, state: "MERGED", body: "  " },
    ] as any,
    [{ number: 3, body: "issue body", labels: [] }],
    "me",
  );
  assert.deepEqual(files, [
    ["pr/pr-7.md", "pr body"],
    ["issue/issue-3.md", "issue body"],
  ]);
});

test("toPull marks a close by a bot or by GitHub Actions as automated", () => {
  const byBot = toPull(raw({ state: "CLOSED", timelineItems: { nodes: [{ actor: actor("github-actions", true) }] } }) as any);
  assert.equal(byBot.closedByAutomation, true);
  const byHuman = toPull(raw({ state: "CLOSED", timelineItems: { nodes: [{ actor: actor("maint") }] } }) as any);
  assert.equal(byHuman.closedByAutomation, false);
});

test("firstTimeQueries asks, per outside author, for merged PRs before that PR was opened", () => {
  const q = firstTimeQueries("acme/widget", [
    { number: 5, author: "alice", authorAssociation: "NONE", createdAt: "2026-02-01T00:00:00Z" },
    { number: 6, author: "maint", authorAssociation: "MEMBER", createdAt: "2026-02-01T00:00:00Z" },
    { number: 7, author: "renovate[bot]", authorAssociation: "NONE", createdAt: "2026-02-01T00:00:00Z" },
  ] as any);
  assert.deepEqual(q, [[5, "repo:acme/widget is:pr is:merged author:alice merged:<2026-02-01T00:00:00Z"]]);
});

test("corpusFiles leaves out the viewer's own bodies", () => {
  const files = corpusFiles(
    [{ number: 7, state: "MERGED", body: "mine", author: "me" }] as any,
    [{ number: 3, body: "also mine", labels: [], author: "me" }, { number: 4, body: "theirs", labels: [], author: "x" }],
    "me",
  );
  assert.deepEqual(files, [["issue/issue-4.md", "theirs"]]);
});
