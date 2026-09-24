#!/usr/bin/env node
// Measure a target repository's maintainers from its own history and write the
// result into a persona file. Hand-written sections of an existing file are kept.
//
//   node measure.ts acme/widget [--out personas/acme/widget.md] [--prs 100]
//                   [--issues 50] [--relation oss|internal] [--as <login>]
//                   [--corpus <dir>]   # also write merged PR bodies, one .md each
//
// Needs an authenticated `gh`. Reads only; never writes to the target.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  classify,
  mergePersona,
  renderMeasured,
  summarizeIssues,
  summarizePulls,
  writingLanguage,
  type Issue,
  type Measured,
  type Pull,
  type Relation,
} from "./persona.ts";

type Args = {
  repo: string; out: string; prs: number; issues: number; relation?: Relation; as?: string; corpus?: string;
};

export function parseArgs(argv: string[]): Args {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const repo = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("usage: measure.ts <owner/repo> [--out file] ...");
  const relation = flag("--relation");
  if (relation && relation !== "oss" && relation !== "internal") throw new Error("--relation must be oss or internal");
  return {
    repo,
    out: flag("--out") ?? `personas/${repo}.md`,
    prs: Number(flag("--prs") ?? 100),
    issues: Number(flag("--issues") ?? 50),
    relation: relation as Relation | undefined,
    as: flag("--as"),
    corpus: flag("--corpus"),
  };
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function graphql<T>(query: string, vars: Record<string, string | number>): T {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  const res = JSON.parse(gh(args));
  if (res.errors) throw new Error(JSON.stringify(res.errors));
  return res.data as T;
}

const login = (a: { login: string; __typename?: string } | null) =>
  a ? (a.__typename === "Bot" && !a.login.endsWith("[bot]") ? `${a.login}[bot]` : a.login) : "ghost";

const ACTOR = "{ login __typename }";
const PULLS = `
query($o:String!,$r:String!,$n:Int!,$after:String){ repository(owner:$o,name:$r){
  pullRequests(last:$n, before:$after, states:[MERGED,CLOSED]){ pageInfo{ hasPreviousPage startCursor }
    nodes{ number title state isDraft authorAssociation createdAt closedAt body
      author ${ACTOR} mergedBy ${ACTOR}
      reviews(first:30){ nodes{ author ${ACTOR} submittedAt } }
      comments(first:20){ nodes{ author ${ACTOR} createdAt } }
      files(first:100){ nodes{ path } }
      commits(first:10){ nodes{ commit{ message } } }
      labels(first:20){ nodes{ name } }
      closingIssuesReferences(first:1){ totalCount } } } } }`;

type RawPull = {
  number: number; title: string; state: Pull["state"]; isDraft: boolean; authorAssociation: string;
  createdAt: string; closedAt: string | null; body: string;
  author: { login: string; __typename: string } | null; mergedBy: { login: string; __typename: string } | null;
  reviews: { nodes: { author: { login: string; __typename: string } | null; submittedAt: string | null }[] };
  comments: { nodes: { author: { login: string; __typename: string } | null; createdAt: string }[] };
  files: { nodes: { path: string }[] }; commits: { nodes: { commit: { message: string } }[] };
  labels: { nodes: { name: string }[] }; closingIssuesReferences: { totalCount: number };
};

export function toPull(p: RawPull): Pull {
  const author = login(p.author);
  const responses = [
    ...p.reviews.nodes.map((r) => ({ who: login(r.author), at: r.submittedAt })),
    ...p.comments.nodes.map((c) => ({ who: login(c.author), at: c.createdAt })),
  ]
    // bots answer within seconds and would make every repo look responsive
    .filter((x) => x.at && x.who !== author && !x.who.endsWith("[bot]"))
    .map((x) => x.at!)
    .sort();
  return {
    number: p.number, title: p.title, state: p.state, isDraft: p.isDraft,
    authorAssociation: p.authorAssociation, author, mergedBy: p.mergedBy ? login(p.mergedBy) : null,
    createdAt: p.createdAt, closedAt: p.closedAt, body: p.body ?? "",
    reviewers: p.reviews.nodes.map((r) => login(r.author)).filter((r) => r !== author),
    files: p.files.nodes.map((f) => f.path),
    commitMessages: p.commits.nodes.map((c) => c.commit.message),
    labels: p.labels.nodes.map((l) => l.name),
    closesIssues: p.closingIssuesReferences.totalCount,
    firstResponseAt: responses[0] ?? null,
  };
}

function fetchPulls(o: string, r: string, total: number): Pull[] {
  const out: Pull[] = [];
  let after: string | undefined;
  while (out.length < total) {
    const vars: Record<string, string | number> = { o, r, n: Math.min(50, total - out.length) };
    if (after) vars.after = after;
    const d = graphql<{ repository: { pullRequests: { pageInfo: { hasPreviousPage: boolean; startCursor: string }; nodes: RawPull[] } } }>(PULLS, vars);
    const page = d.repository.pullRequests;
    out.push(...page.nodes.map(toPull));
    if (!page.pageInfo.hasPreviousPage) break;
    after = page.pageInfo.startCursor;
  }
  return out;
}

function fetchIssues(o: string, r: string, n: number): Issue[] {
  const d = graphql<{ repository: { issues: { nodes: { body: string; labels: { nodes: { name: string }[] } }[] } } }>(
    `query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){
       issues(last:$n){ nodes{ body labels(first:20){ nodes{ name } } } } } }`,
    { o, r, n },
  );
  return d.repository.issues.nodes.map((i) => ({ body: i.body ?? "", labels: i.labels.nodes.map((l) => l.name) }));
}

const CONTRIBUTING = ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"];
const PR_TEMPLATE = [
  ".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "pull_request_template.md",
  "PULL_REQUEST_TEMPLATE.md", "docs/pull_request_template.md",
];
const CODEOWNERS = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"];

function fetchRepoFacts(o: string, r: string) {
  const paths = [...CONTRIBUTING, ...PR_TEMPLATE, ...CODEOWNERS];
  const aliases = paths.map((p, i) => `f${i}: object(expression:"HEAD:${p}"){ __typename }`).join(" ");
  const d = graphql<Record<string, any>>(
    `query($o:String!,$r:String!){ viewer{ login }
       repository(owner:$o,name:$r){ visibility
         owner{ __typename ... on Organization{ viewerIsAMember } }
         defaultBranchRef{ name target{ oid } }
         templates: object(expression:"HEAD:.github/ISSUE_TEMPLATE"){ ... on Tree{ entries{ name } } }
         ${aliases} } }`,
    { o, r },
  );
  const repo = d.repository;
  const present = (p: string) => repo[`f${paths.indexOf(p)}`] !== null;
  return {
    viewer: d.viewer.login as string,
    visibility: repo.visibility as string,
    viewerIsOrgMember: repo.owner.__typename === "Organization" ? Boolean(repo.owner.viewerIsAMember) : d.viewer.login === o,
    branch: repo.defaultBranchRef.name as string,
    headSha: repo.defaultBranchRef.target.oid as string,
    files: {
      contributing: CONTRIBUTING.find(present) ?? null,
      prTemplate: PR_TEMPLATE.find(present) ?? null,
      issueTemplates: (repo.templates?.entries ?? []).map((e: { name: string }) => e.name) as string[],
      codeowners: CODEOWNERS.some(present),
    },
  };
}

export function describeRules(rules: { type: string; parameters?: Record<string, any> }[]): string[] {
  return rules.map((rule) => {
    const p = rule.parameters ?? {};
    if (rule.type === "pull_request") {
      const bits = [`${p.required_approving_review_count ?? 0} approval`];
      if (p.require_code_owner_review) bits.push("code owner review");
      if (p.required_review_thread_resolution) bits.push("threads resolved");
      return `pull_request: ${bits.join(", ")}`;
    }
    if (rule.type === "required_status_checks") {
      return `required checks: ${(p.required_status_checks ?? []).map((c: { context: string }) => c.context).join(", ") || "none"}`;
    }
    return rule.type;
  });
}

function fetchRules(o: string, r: string, branch: string): string[] {
  try {
    return describeRules(JSON.parse(gh(["api", `repos/${o}/${r}/rules/branches/${branch}`])));
  } catch {
    return [];
  }
}

function countMine(repo: string, me: string, extra: string): number {
  const q = `repo:${repo} is:pr author:${me} ${extra}`.trim();
  return Number(gh(["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", "per_page=1", "--jq", ".total_count"]).trim());
}

function main(argv: string[]) {
  const args = parseArgs(argv);
  const [o, r] = args.repo.split("/");
  const facts = fetchRepoFacts(o, r);
  const me = args.as ?? facts.viewer;
  const pulls = fetchPulls(o, r, args.prs);
  const pullSummary = summarizePulls(pulls);
  const issueSummary = summarizeIssues(fetchIssues(o, r, args.issues));
  const measured: Measured = {
    repo: args.repo,
    measuredAt: new Date().toISOString().slice(0, 10),
    headSha: facts.headSha,
    viewer: me,
    context: classify({
      visibility: facts.visibility,
      viewerIsOrgMember: facts.viewerIsOrgMember,
      myPrs: countMine(args.repo, me, ""),
      myMergedPrs: countMine(args.repo, me, "is:merged"),
      relationOverride: args.relation,
    }),
    files: facts.files,
    rules: fetchRules(o, r, facts.branch),
    language: writingLanguage(pullSummary, issueSummary),
    pulls: pullSummary,
    issues: issueSummary,
  };
  if (args.corpus) {
    mkdirSync(args.corpus, { recursive: true });
    for (const p of pulls.filter((p) => p.state === "MERGED" && p.body.trim())) {
      writeFileSync(join(args.corpus, `pr-${p.number}.md`), p.body);
    }
  }
  const existing = existsSync(args.out) ? readFileSync(args.out, "utf8") : null;
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, mergePersona(existing, renderMeasured(measured)));
  const c = measured.context;
  console.log(`${existing ? "updated" : "created"} ${args.out} (${c.relation}, ${c.standing}, ${c.exposure}, ${measured.language})`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
