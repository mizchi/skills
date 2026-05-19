#!/usr/bin/env node
// Reject query.sql statements that mix anonymous `?` with `sqlc.arg(...)`
// in the same SQL body.
//
// sqlc-gen-moonbit emits `?` (auto-numbered by SQLite spec: "max used +
// 1") alongside `sqlc.arg(name)` (compiled to a fixed `?N`). When both
// appear in the same statement, a trailing anonymous `?` can land on a
// number higher than the bind-array length, and D1 returns a parameter
// count mismatch (surfaces as 500 on the public memory handler).
// See the placeholder-mix bug (see `docs/regression/worker-deploy.md`) for the GetOwnerMemoryByHashRange repro.
//
// Rule: within a single -- name: ... statement, use either pure
// anonymous `?` or pure `sqlc.arg(...)`. Pure `?N` numbered is fine on
// its own but we don't expect query.sql authors to write `?N` by hand;
// flag any mix as the dangerous case.

import { readFile } from "node:fs/promises";

const QUERY_SQL = new URL("../db/sqlite/query.sql", import.meta.url);

function splitStatements(text) {
  const statements = [];
  let current = null;
  for (const rawLine of text.split("\n")) {
    const nameMatch = rawLine.match(/^--\s*name:\s*(\S+)/);
    if (nameMatch) {
      if (current) statements.push(current);
      current = { name: nameMatch[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(rawLine);
  }
  if (current) statements.push(current);
  return statements;
}

function stripStringsAndComments(body) {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'") {
      i += 1;
      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (body[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "-" && body[i + 1] === "-") {
      while (i < body.length && body[i] !== "\n") i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function findOffenders(statements) {
  const offenders = [];
  for (const stmt of statements) {
    const body = stripStringsAndComments(stmt.lines.join("\n"));
    const hasAnonymous = /\?(?!\d)/.test(body);
    const hasSqlcArg = /\bsqlc\.arg\s*\(/.test(body);
    if (hasAnonymous && hasSqlcArg) {
      offenders.push(stmt.name);
    }
  }
  return offenders;
}

async function main() {
  const text = await readFile(QUERY_SQL, "utf8");
  const statements = splitStatements(text);
  const offenders = findOffenders(statements);
  if (offenders.length === 0) {
    console.log(
      `check-sql-placeholder-mix: OK (${statements.length} statements scanned, no anonymous-vs-named mixes).`,
    );
    return;
  }
  console.error(
    `check-sql-placeholder-mix: ${offenders.length} statement(s) mix anonymous \`?\` with sqlc.arg(...):`,
  );
  for (const name of offenders) {
    console.error(`  - ${name}`);
  }
  console.error(
    "Convert remaining `?` to sqlc.arg('<n>') so the generator emits consecutive ?1..?N. See PR #124.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
