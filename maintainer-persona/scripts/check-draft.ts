#!/usr/bin/env node
// Check an issue/PR draft against the target before it leaves:
// every repository it references must be readable by the target's readers,
// and the body should not exceed the length the maintainers actually write.
//
//   node check-draft.ts --persona personas/acme/widget.md draft.md
//
// Exit 1 on an error (unreadable reference on a public target), 0 otherwise.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readMeasuredData } from "./persona.ts";

const URL_REF = /https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?=[/#?\s)"'`>]|$)/g;
const HASH_REF = /(?<![\w/.-])([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)#\d+/g;
const TICK_REF = /`([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)`/g;
// a backticked a/b is only a repo when b has no extension and a is not a common dir
const NOT_OWNER = /^(src|lib|docs|test|tests|scripts|bin|pkg|cmd|internal|app|apps|packages)$/;

export function findRepoRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(URL_REF)) out.add(`${m[1]}/${m[2]}`);
  for (const m of text.matchAll(HASH_REF)) out.add(`${m[1]}/${m[2]}`);
  for (const m of text.matchAll(TICK_REF)) {
    if (!NOT_OWNER.test(m[1]) && !m[2].includes(".")) out.add(`${m[1]}/${m[2]}`);
  }
  return [...out];
}

export function evaluateDraft(input: {
  text: string;
  target: string;
  exposure: "public" | "private";
  refVisibility: Map<string, string | null>;
  bodyP90: number | null;
}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const targetOwner = input.target.split("/")[0];
  for (const ref of findRepoRefs(input.text)) {
    if (ref === input.target) continue;
    const vis = input.refVisibility.get(ref) ?? null;
    if (vis === "PUBLIC") continue;
    const what = vis === null ? "cannot be resolved" : `is ${vis}`;
    if (input.exposure === "public") {
      errors.push(`${ref} ${what}: readers of a public ${input.target} cannot open it, and the name itself is published`);
    } else if (ref.split("/")[0] !== targetOwner) {
      warnings.push(`${ref} ${what} and belongs to another owner: check that ${input.target}'s readers can open it`);
    }
  }
  if (input.bodyP90 && input.text.length > input.bodyP90) {
    warnings.push(`body is ${input.text.length} chars; ${input.target}'s p90 is ${input.bodyP90}`);
  }
  return { errors, warnings };
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
  const i = argv.indexOf("--persona");
  if (i < 0 || !argv[i + 1] || argv.length < 3) {
    console.error("usage: check-draft.ts --persona <persona.md> <draft.md>");
    process.exit(2);
  }
  const persona = readMeasuredData(readFileSync(argv[i + 1], "utf8"));
  if (!persona) {
    console.error(`${argv[i + 1]}: no measured block; run measure.ts first`);
    process.exit(2);
  }
  const draftPath = argv.filter((_, k) => k !== i && k !== i + 1)[0];
  const text = readFileSync(draftPath, "utf8");
  const refVisibility = new Map(findRepoRefs(text).map((r) => [r, visibilityOf(r)] as const));
  const { errors, warnings } = evaluateDraft({
    text,
    target: persona.repo,
    exposure: persona.context.exposure,
    refVisibility,
    bodyP90: persona.pulls.bodyChars.p90 || null,
  });
  for (const w of warnings) console.log(`warn: ${w}`);
  for (const e of errors) console.log(`error: ${e}`);
  process.exit(errors.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
