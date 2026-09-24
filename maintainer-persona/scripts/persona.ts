// Pure logic for maintainer-persona: summarise fetched history, classify the
// contributor context, render the measured block, merge it into a persona file.
// No I/O here; measure.ts does the fetching and writing.

export type Pull = {
  number: number;
  title: string;
  state: "MERGED" | "CLOSED" | "OPEN";
  isDraft: boolean;
  authorAssociation: string;
  author: string;
  mergedBy: string | null;
  createdAt: string;
  closedAt: string | null;
  body: string;
  reviewers: string[];
  files: string[];
  commitMessages: string[];
  labels: string[];
  closesIssues: number;
  // earliest review or comment by someone other than the author
  firstResponseAt: string | null;
};

export type Issue = { body: string; labels: string[] };

export type Tally = [string, number][];
export type Spread = { median: number; p90: number };

export type AssociationOutcome = {
  merged: number;
  closedUnmerged: number;
  noResponse: number;
  firstResponseHoursMedian: number | null;
};

export type PullSummary = {
  merged: number;
  closedUnmerged: number;
  conventionalTitles: number;
  closesIssue: number;
  touchesTests: number;
  signedOff: number;
  selfMerged: number;
  drafts: number;
  japaneseBodies: number;
  bodyChars: Spread;
  headings: Tally;
  labels: Tally;
  humanReviewers: Tally;
  botReviewers: Tally;
  byAssociation: Record<string, AssociationOutcome>;
};

export type IssueSummary = { count: number; japaneseBodies: number; bodyChars: Spread; headings: Tally; labels: Tally };

export type Relation = "oss" | "internal";
export type Context = { relation: Relation; standing: "first-time" | "returning"; exposure: "public" | "private" };

export type Measured = {
  repo: string;
  measuredAt: string;
  headSha: string;
  context: Context;
  language: Language;
  viewer: string;
  files: { contributing: string | null; prTemplate: string | null; issueTemplates: string[]; codeowners: boolean };
  rules: string[];
  pulls: PullSummary;
  issues: IssueSummary;
};

const TOP = 15;
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|test|tests|perf|build|ci|style|revert)(\([^)]*\))?!?:\s/i;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|specs)\/|[._-](test|spec)s?\.[a-z0-9]+$/i;
const SIGNED_OFF = /^Signed-off-by:/m;
const BOT = /\[bot\]$/i;

export function spread(values: number[]): Spread {
  if (values.length === 0) return { median: 0, p90: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : Math.floor((s[mid - 1] + s[mid]) / 2);
  // nearest-rank percentile
  const p90 = s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
  return { median, p90 };
}

function tally(groups: Iterable<string>[]): Tally {
  const counts = new Map<string, number>();
  for (const g of groups) for (const k of new Set(g)) counts.set(k, (counts.get(k) ?? 0) + 1);
  // stable: ties keep first-seen order
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP);
}

const HEADING_MAX = 60;
const KANA = /[\u3040-\u30ff]/;

export function headingsOf(body: string): string[] {
  return [...body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) => {
    const h = m[1].toLowerCase();
    return h.length > HEADING_MAX ? `${h.slice(0, HEADING_MAX).trimEnd()}…` : h;
  });
}

const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

export function summarizePulls(pulls: Pull[]): PullSummary {
  const merged = pulls.filter((p) => p.state === "MERGED");
  const closed = pulls.filter((p) => p.state === "CLOSED");
  const reviewerGroups = merged.map((p) => p.reviewers);

  const byAssociation: Record<string, AssociationOutcome> = {};
  for (const assoc of new Set(pulls.map((p) => p.authorAssociation))) {
    const group = pulls.filter((p) => p.authorAssociation === assoc && p.state !== "OPEN");
    const responded = group.filter((p) => p.firstResponseAt);
    byAssociation[assoc] = {
      merged: group.filter((p) => p.state === "MERGED").length,
      closedUnmerged: group.filter((p) => p.state === "CLOSED").length,
      noResponse: group.length - responded.length,
      firstResponseHoursMedian: responded.length
        ? spread(responded.map((p) => Math.round(hoursBetween(p.createdAt, p.firstResponseAt!)))).median
        : null,
    };
  }

  return {
    merged: merged.length,
    closedUnmerged: closed.length,
    conventionalTitles: merged.filter((p) => CONVENTIONAL.test(p.title)).length,
    closesIssue: merged.filter((p) => p.closesIssues > 0).length,
    touchesTests: merged.filter((p) => p.files.some((f) => TEST_PATH.test(f))).length,
    signedOff: merged.filter((p) => p.commitMessages.some((m) => SIGNED_OFF.test(m))).length,
    selfMerged: merged.filter((p) => p.mergedBy === p.author).length,
    drafts: pulls.filter((p) => p.isDraft).length,
    japaneseBodies: merged.filter((p) => KANA.test(p.body)).length,
    bodyChars: spread(merged.map((p) => p.body.length)),
    headings: tally(merged.map((p) => headingsOf(p.body))),
    labels: tally(merged.map((p) => p.labels)),
    humanReviewers: tally(reviewerGroups.map((g) => g.filter((r) => !BOT.test(r)))),
    botReviewers: tally(reviewerGroups.map((g) => g.filter((r) => BOT.test(r)))),
    byAssociation,
  };
}

export function summarizeIssues(issues: Issue[]): IssueSummary {
  return {
    count: issues.length,
    japaneseBodies: issues.filter((i) => KANA.test(i.body)).length,
    bodyChars: spread(issues.map((i) => i.body.length)),
    headings: tally(issues.map((i) => headingsOf(i.body))),
    labels: tally(issues.map((i) => i.labels)),
  };
}

export type Language = "ja" | "en" | "mixed";

// The language maintainers write in, from merged PR and issue bodies together.
export function writingLanguage(pulls: PullSummary, issues: IssueSummary): Language {
  const total = pulls.merged + issues.count;
  if (total === 0) return "en";
  const share = (pulls.japaneseBodies + issues.japaneseBodies) / total;
  return share >= 0.5 ? "ja" : share <= 0.1 ? "en" : "mixed";
}

export function classify(input: {
  visibility: string;
  viewerIsOrgMember: boolean;
  myPrs: number;
  myMergedPrs: number;
  relationOverride?: Relation;
}): Context {
  const exposure = input.visibility === "PUBLIC" ? "public" : "private";
  const relation: Relation =
    input.relationOverride ?? (exposure === "private" || input.viewerIsOrgMember ? "internal" : "oss");
  return { relation, standing: input.myMergedPrs > 0 ? "returning" : "first-time", exposure };
}

// ---- rendering -----------------------------------------------------------

const BEGIN = "<!-- maintainer-persona:measured:begin -->";
const END = "<!-- maintainer-persona:measured:end -->";
const DATA = /<!-- maintainer-persona:data (.*?) -->/s;

const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "0/0");
const list = (t: Tally) => (t.length ? t.map(([k, n]) => `\`${k}\` ${n}`).join(", ") : "none");

export function renderMeasured(m: Measured): string {
  const p = m.pulls;
  const assoc = Object.entries(p.byAssociation)
    .map(
      ([k, v]) =>
        `| ${k} | ${v.merged} | ${v.closedUnmerged} | ${v.noResponse} | ${v.firstResponseHoursMedian ?? "-"} |`,
    )
    .join("\n");
  const data = JSON.stringify(m).replace(/-->/g, "--\\u003e");
  return [
    BEGIN,
    `<!-- maintainer-persona:data ${data} -->`,
    "",
    `Measured ${m.measuredAt} at \`${m.headSha.slice(0, 12)}\` as \`${m.viewer}\`.`,
    `Context: **${m.context.relation}**, **${m.context.standing}**, exposure **${m.context.exposure}**, writes in **${m.language}**` +
      ` (Japanese bodies: PRs ${pct(m.pulls.japaneseBodies, m.pulls.merged)}, issues ${pct(m.issues.japaneseBodies, m.issues.count)}).`,
    "",
    "### Gates and files",
    "",
    `- CONTRIBUTING: ${m.files.contributing ? `\`${m.files.contributing}\`` : "none"}`,
    `- PR template: ${m.files.prTemplate ? `\`${m.files.prTemplate}\`` : "none"}`,
    `- Issue templates: ${m.files.issueTemplates.length ? m.files.issueTemplates.map((f) => `\`${f}\``).join(", ") : "none"}`,
    `- CODEOWNERS: ${m.files.codeowners ? "yes" : "no"}`,
    `- Rules on the default branch: ${m.rules.length ? m.rules.join("; ") : "none readable"}`,
    "",
    `### Pull requests (${p.merged} merged, ${p.closedUnmerged} closed unmerged)`,
    "",
    `- Body length (chars): median ${p.bodyChars.median}, p90 ${p.bodyChars.p90}`,
    `- Conventional-commit titles: ${pct(p.conventionalTitles, p.merged)}`,
    `- Links a closing issue: ${pct(p.closesIssue, p.merged)}`,
    `- Touches a test file: ${pct(p.touchesTests, p.merged)}`,
    `- Signed-off-by in commits: ${pct(p.signedOff, p.merged)}`,
    `- Self-merged: ${pct(p.selfMerged, p.merged)}`,
    `- Drafts in sample: ${p.drafts}`,
    `- Headings: ${list(p.headings)}`,
    `- Labels: ${list(p.labels)}`,
    `- Human reviewers (PRs reviewed): ${list(p.humanReviewers)}`,
    `- Bot reviewers: ${list(p.botReviewers)}`,
    "",
    "| author association | merged | closed unmerged | no response | first response, median h |",
    "|---|---|---|---|---|",
    assoc,
    "",
    `### Issues (${m.issues.count})`,
    "",
    `- Body length (chars): median ${m.issues.bodyChars.median}, p90 ${m.issues.bodyChars.p90}`,
    `- Headings: ${list(m.issues.headings)}`,
    `- Labels: ${list(m.issues.labels)}`,
    END,
  ].join("\n");
}

export function readMeasuredData(text: string): Measured | null {
  const m = text.match(DATA);
  return m ? (JSON.parse(m[1]) as Measured) : null;
}

const SKELETON = (repo: string) => `# Persona: ${repo}

Everything outside the measured block is hand-written and survives re-measuring.
The measured block is regenerated by \`measure.ts\`; do not edit inside it.
Measurements transfer between findings; the advice in sections 4-6 depends on the
finding you had in mind when you wrote it, so re-derive it when that changes.

## 1. Readers

<!-- Who triages, who reviews which directory, what they are paid to care about. -->

## 2. Vocabulary usable bare

<!-- Terms that appear in their own README, labels, issues. Cite where. -->

## 3. Needs translating

<!-- Your terms -> their terms. A word with zero hits in their repo goes here. -->

| ours | why it does not land | theirs |
|---|---|---|

## 4. Issue conventions

## 5. PR conventions

## 6. Landmines

## 7. Evidence and weak spots

<!-- Commands you ran, what you read, and which rows rest on few examples. -->

## 8. Measurements

`;

export function mergePersona(existing: string | null, block: string): string {
  if (existing === null) {
    const repo = readMeasuredData(block)?.repo ?? "unknown";
    return `${SKELETON(repo)}${block}\n`;
  }
  const b = existing.indexOf(BEGIN);
  const e = existing.indexOf(END);
  if (b < 0 || e < b) {
    throw new Error("persona file has no measured-block markers; restore them or move the file aside");
  }
  return existing.slice(0, b) + block + existing.slice(e + END.length);
}
