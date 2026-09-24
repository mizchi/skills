#!/usr/bin/env node
// Check an issue/PR draft against the target before it leaves:
// every repository it references must be readable by the target's readers,
// the body should not exceed the length the maintainers write for that kind,
// and it should be in the language they use for that kind.
//
//   node check-draft.ts --persona personas/acme/widget.md --kind issue|pr draft.md
//
// Exit 1 on an error (unreadable reference on a public target), 0 otherwise.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { KANA_RE, readMeasuredData, visibleText, type Kind, type Language } from "./persona.ts";

export type RefForm = "url" | "hash" | "tick";
export type Ref = { repo: string; form: RefForm };

const URL_REF = /https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?=[/#?\s)"'`>]|$)/g;
const HASH_REF = /(?<![\w/.-])([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)#\d+/g;
const TICK_REF = /`([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)`/g;
// a backticked a/b is only a candidate when b has no extension and a is not a common dir
const NOT_OWNER = /^(src|lib|docs|test|tests|scripts|bin|pkg|cmd|internal|app|apps|packages)$/;

export function findRepoRefs(text: string): Ref[] {
  const out = new Map<string, RefForm>();
  const add = (repo: string, form: RefForm) => {
    if (!out.has(repo)) out.set(repo, form);
  };
  for (const m of text.matchAll(URL_REF)) add(`${m[1]}/${m[2]}`, "url");
  for (const m of text.matchAll(HASH_REF)) add(`${m[1]}/${m[2]}`, "hash");
  for (const m of text.matchAll(TICK_REF)) {
    if (!NOT_OWNER.test(m[1]) && !m[2].includes(".")) add(`${m[1]}/${m[2]}`, "tick");
  }
  return [...out].map(([repo, form]) => ({ repo, form }));
}

export function evaluateDraft(input: {
  text: string;
  target: string;
  kind: Kind;
  exposure: "public" | "private";
  refVisibility: Map<string, string | null>;
  bodyP90: number | null;
  language: Language;
}): { errors: string[]; warnings: string[]; summary: string } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const targetOwner = input.target.split("/")[0];
  const others = findRepoRefs(input.text).filter((r) => r.repo !== input.target);
  for (const { repo, form } of others) {
    if (repo === input.target) continue;
    const vis = input.refVisibility.get(repo) ?? null;
    if (vis === "PUBLIC") continue;
    // `feature/x` in backticks is usually a branch or path; only a repository that exists counts
    if (vis === null && form === "tick") continue;
    const what = vis === null ? "cannot be resolved" : `is ${vis}`;
    if (input.exposure === "public") {
      errors.push(`${repo} ${what}: readers of a public ${input.target} cannot open it, and the name itself is published`);
    } else if (repo.split("/")[0] !== targetOwner) {
      warnings.push(`${repo} ${what} and belongs to another owner: check that ${input.target}'s readers can open it`);
    }
  }
  // same basis as the measured p90: the part visible without expanding <details>
  const visible = visibleText(input.text).length;
  if (input.bodyP90 && visible > input.bodyP90) {
    warnings.push(`visible body is ${visible} chars; ${input.target}'s ${input.kind} p90 is ${input.bodyP90}`);
  }
  const japanese = KANA_RE.test(input.text);
  let languageOk = true;
  if (input.language === "en" && japanese) {
    languageOk = false;
    warnings.push(`draft contains Japanese but ${input.target} writes ${input.kind}s in en`);
  } else if (input.language === "ja" && !japanese) {
    languageOk = false;
    warnings.push(`draft has no Japanese but ${input.target} writes ${input.kind}s in ja`);
  }
  const summary =
    `visible ${visible}/${input.bodyP90 ?? "-"} chars (${input.kind} p90), ` +
    `language ${input.language} ${languageOk ? "ok" : "mismatch"}, ${others.length} other repository references`;
  return { errors, warnings, summary };
}

function visibilityOf(repo: string): string | null {
  try {
    return execFileSync("gh", ["api", `repos/${repo}`, "--jq", ".visibility | ascii_upcase"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function main(argv: string[]) {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const personaPath = flag("--persona");
  const kind = flag("--kind");
  const draftPath = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  if (!personaPath || (kind !== "issue" && kind !== "pr") || !draftPath) {
    console.error("usage: check-draft.ts --persona <persona.md> --kind issue|pr <draft.md>");
    process.exit(2);
  }
  const persona = readMeasuredData(readFileSync(personaPath, "utf8"));
  if (!persona) {
    console.error(`${personaPath}: no measured block; run measure.ts first`);
    process.exit(2);
  }
  const text = readFileSync(draftPath, "utf8");
  const refVisibility = new Map(findRepoRefs(text).map((r) => [r.repo, visibilityOf(r.repo)] as const));
  const summary = kind === "pr" ? persona.pulls : persona.issues;
  const { errors, warnings, summary: checked } = evaluateDraft({
    text,
    target: persona.repo,
    kind,
    exposure: persona.context.exposure,
    refVisibility,
    bodyP90: summary.bodyChars.p90 || null,
    language: persona.languages[kind],
  });
  for (const w of warnings) console.log(`warn: ${w}`);
  for (const e of errors) console.log(`error: ${e}`);
  console.log(`${errors.length ? "FAIL" : "ok"}: ${checked}`);
  process.exit(errors.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
