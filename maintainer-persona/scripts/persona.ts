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
  // earliest review or comment by a human other than the author
  firstResponseAt: string | null;
  // the author had no merged PR in this repo when this PR was opened.
  // Not the same as authorAssociation, which GitHub computes at query time:
  // an outsider whose first PR merged is now CONTRIBUTOR.
  firstTimeAtCreation: boolean;
  closedByAutomation: boolean;
};

export type Issue = { number?: number; author?: string; body: string; labels: string[] };

export type Tally = [string, number][];
export type Spread = { median: number; p90: number };

export type AssociationOutcome = {
  merged: number;
  closedUnmerged: number;
  noResponse: number;
  firstResponseHoursMedian: number | null;
};

export type FirstTimerOutcome = AssociationOutcome & { closedByAutomation: number };

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
  politeBodies: number;
  bodyChars: Spread;
  headings: Tally;
  labels: Tally;
  humanReviewers: Tally;
  botReviewers: Tally;
  byAssociation: Record<string, AssociationOutcome>;
  firstTimers: FirstTimerOutcome;
};

export type IssueSummary = { count: number; japaneseBodies: number; politeBodies: number; bodyChars: Spread; headings: Tally; labels: Tally };

export type Relation = "oss" | "internal";
export type Context = { relation: Relation; standing: "first-time" | "returning"; exposure: "public" | "private" };

export type Measured = {
  repo: string;
  measuredAt: string;
  headSha: string;
  context: Context;
  languages: Record<Kind, Language>;
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

// What a reader sees without expanding anything: <details> and HTML comments
// (PR template instructions) are dropped, on the corpus and the draft alike.
export function visibleText(body: string): string {
  return body.replace(/<details>[\s\S]*?<\/details>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
}

const POLITE_END = /(です|ます|でした|ました|ません|でしょう|ください)$/;

// 敬体 or 常体, by the majority of sentence endings; null when not Japanese.
export function registerOf(body: string): "polite" | "plain" | null {
  const sentences = visibleText(body)
    .split(/[。．!！?？\n]+/)
    .map((x) => x.replace(/[\s)）」』*`]+$/, ""))
    .filter((x) => KANA.test(x));
  if (sentences.length === 0) return null;
  const polite = sentences.filter((x) => POLITE_END.test(x)).length;
  return polite * 2 >= sentences.length ? "polite" : "plain";
}

const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

export function summarizePulls(pulls: Pull[]): PullSummary {
  const merged = pulls.filter((p) => p.state === "MERGED");
  const closed = pulls.filter((p) => p.state === "CLOSED");
  const reviewerGroups = merged.map((p) => p.reviewers);

  const outcome = (group: Pull[]): AssociationOutcome => {
    const responded = group.filter((p) => p.firstResponseAt);
    return {
      merged: group.filter((p) => p.state === "MERGED").length,
      closedUnmerged: group.filter((p) => p.state === "CLOSED").length,
      noResponse: group.length - responded.length,
      firstResponseHoursMedian: responded.length
        ? spread(responded.map((p) => Math.round(hoursBetween(p.createdAt, p.firstResponseAt!)))).median
        : null,
    };
  };
  const done = pulls.filter((p) => p.state !== "OPEN");
  const byAssociation: Record<string, AssociationOutcome> = {};
  for (const assoc of new Set(done.map((p) => p.authorAssociation))) {
    byAssociation[assoc] = outcome(done.filter((p) => p.authorAssociation === assoc));
  }
  // automated closes are reported apart: they say nothing about human review
  const first = done.filter((p) => p.firstTimeAtCreation);
  const firstTimers = {
    ...outcome(first.filter((p) => !p.closedByAutomation)),
    closedByAutomation: first.filter((p) => p.closedByAutomation).length,
  };

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
    politeBodies: merged.filter((p) => registerOf(p.body) === "polite").length,
    bodyChars: spread(merged.map((p) => visibleText(p.body).length)),
    headings: tally(merged.map((p) => headingsOf(p.body))),
    labels: tally(merged.map((p) => p.labels)),
    humanReviewers: tally(reviewerGroups.map((g) => g.filter((r) => !BOT.test(r)))),
    botReviewers: tally(reviewerGroups.map((g) => g.filter((r) => BOT.test(r)))),
    byAssociation,
    firstTimers,
  };
}

export const KANA_RE = KANA;

export function summarizeIssues(issues: Issue[]): IssueSummary {
  return {
    count: issues.length,
    japaneseBodies: issues.filter((i) => KANA.test(i.body)).length,
    politeBodies: issues.filter((i) => registerOf(i.body) === "polite").length,
    bodyChars: spread(issues.map((i) => visibleText(i.body).length)),
    headings: tally(issues.map((i) => headingsOf(i.body))),
    labels: tally(issues.map((i) => i.labels)),
  };
}

export type Language = "ja" | "en" | "mixed";

// The language maintainers write in, decided separately for PRs and issues:
// one repo can take English PRs and Japanese issues.
export function languageOf(japanese: number, total: number): Language {
  if (total === 0) return "en";
  const share = japanese / total;
  return share >= 0.5 ? "ja" : share <= 0.1 ? "en" : "mixed";
}

export type Kind = "issue" | "pr";

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
  const ft = p.firstTimers;
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
    `Context: **${m.context.relation}**, **${m.context.standing}**, exposure **${m.context.exposure}**.`,
    `PRs are written in **${m.languages.pr}** (Japanese ${pct(m.pulls.japaneseBodies, m.pulls.merged)}),` +
      ` issues in **${m.languages.issue}** (Japanese ${pct(m.issues.japaneseBodies, m.issues.count)}).` +
      ` Polite form (敬体) among Japanese bodies: PRs ${pct(m.pulls.politeBodies, m.pulls.japaneseBodies)},` +
      ` issues ${pct(m.issues.politeBodies, m.issues.japaneseBodies)}.`,
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
    `- Visible body length (chars, outside <details> and comments): median ${p.bodyChars.median}, p90 ${p.bodyChars.p90}`,
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
    `First-time authors (no merged PR when they opened it): ${ft.merged} merged, ${ft.closedUnmerged} closed by a human,` +
      ` ${ft.closedByAutomation} closed by automation; ${ft.noResponse} of the human-handled got no human response;` +
      ` first human response median ${ft.firstResponseHoursMedian ?? "-"} h.`,
    "",
    "| author association as of now (merged first-timers show as CONTRIBUTOR) | merged | closed unmerged | no response | first response, median h |",
    "|---|---|---|---|---|",
    assoc,
    "",
    `### Issues (${m.issues.count})`,
    "",
    `- Visible body length (chars): median ${m.issues.bodyChars.median}, p90 ${m.issues.bodyChars.p90}`,
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
