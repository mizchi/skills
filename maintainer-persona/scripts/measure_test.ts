import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, toPull } from "./measure.ts";

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
