#!/usr/bin/env node
// Post-`sqlc generate` patch: wrap every `@core.any(params.<int64_field>)`
// site in `src/db/gen/sqlc_queries.mbt` with `int64_bind_safe(...)` so the
// underlying BigInt is coerced to Number before `.bind()`.
//
// Root cause: docs/regression/worker-deploy.md §Int64-bind hang. `@core.any(Int64)` passes BigInt to D1 bind, which
// causes `.all()` / `.run()` to never resolve and the Worker hangs.
//
// This patch reads the Params struct definitions from `sqlc_types.mbt` to
// learn which fields are `Int64` / `Int64?`, then rewrites the bind list
// in `sqlc_queries.mbt`. Re-run after every `sqlc generate`. Wire into
// `package.json` `db:generate` so it always runs.
//
// Two modes:
//   --apply  (default): rewrite the file in place. Used by db:generate.
//   --verify          : exit non-zero if any Int64 bind site is still
//                        unwrapped, without touching the file. Used as
//                        a build / CI gate to catch a regression where
//                        someone hand-edited the gen file or the patch
//                        step was skipped.
//
// Upstream fix would be: have sqlc-gen-moonbit emit the Number conversion
// itself. Filed as a follow-up issue.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv.includes("--verify") ? "verify" : "apply";

const root = resolve(import.meta.dirname, "..");
const typesPath = resolve(root, "src/db/gen/sqlc_types.mbt");
const queriesPath = resolve(root, "src/db/gen/sqlc_queries.mbt");

// Starter-friendly: when sqlc hasn't been run yet (fresh clone, no
// queries defined), neither file exists. Treat that as "nothing to
// patch / verify" instead of throwing — db:generate will create them
// the first time the user runs it.
if (!existsSync(typesPath) || !existsSync(queriesPath)) {
  console.log(
    `patch-int64-binds${mode === "verify" ? " --verify" : ""}: skipped (no codegen yet — run \`pnpm run db:generate\`).`,
  );
  process.exit(0);
}

const typesSource = readFileSync(typesPath, "utf8");
const queriesSource = readFileSync(queriesPath, "utf8");

// Parse `pub struct <Name>Params { field : Int64 ... }` blocks and record
// which (struct, field) tuples have an Int64 or Int64? type. The bind
// rewrite shape differs for Int64 vs Int64?: the former is bound directly
// (`@core.any(params.f)`), the latter is destructured via
// `(match params.f { Some(v) => @core.any(v); None => @core.null() })` —
// and the unwrapped `v` in the Some arm is still Int64, so it also hangs
// D1 if left as a BigInt.
const int64Fields = new Map(); // key: structName::field, value: "required" | "optional"
for (
  const m of typesSource.matchAll(
    /pub struct (\w+Params) \{([^}]*)\}/g,
  )
) {
  const structName = m[1];
  const body = m[2];
  for (const fm of body.matchAll(/(\w+)\s*:\s*Int64(\?)?\s*\n/g)) {
    int64Fields.set(`${structName}::${fm[1]}`, fm[2] ? "optional" : "required");
  }
}

if (int64Fields.size === 0) {
  console.log("patch-int64-binds: no Int64 params found, nothing to do");
  process.exit(0);
}

let patched = queriesSource;
let edits = 0;
const unwrappedSites = []; // for verify mode reporting

// Walk every `db.prepare(...).bind([...])` site. The preceding fn
// signature tells us the Params struct. Wrap each `@core.any(params.<f>)`
// whose field f is Int64-ish.
//
// Block-based parsing instead of a single fragile regex: split on
// `pub async fn ` boundaries so the body match never truncates at a
// `match X { ... }` brace (the previous `\{[^}]+\}` body matcher silently
// skipped the rest of any function that had an Optional field encoded as
// `(match params.X { Some(v) => @core.any(v); None => @core.null() })` —
// which hid docs/regression/worker-deploy.md §Int64-bind hang on `create_knowledge_link.position` and caused
// production 1101 hangs on knowledge upsert with `[[wikilink]]` content).
const blocks = patched.split(/^(?=pub async fn )/m);
const rewrittenBlocks = blocks.map((block) => {
  const sigMatch = block.match(
    /^pub async fn (\w+)\(db : @cloudflare\.D1Database, params : (\w+Params)\)/,
  );
  if (!sigMatch) return block;
  const fnName = sigMatch[1];
  const paramsType = sigMatch[2];

  let updated = block;
  // (1) Required `Int64` fields: `@core.any(params.f)` → wrap.
  for (
    const bindMatch of [
      ...block.matchAll(/@core\.any\(params\.(\w+)\)/g),
    ]
  ) {
    const field = bindMatch[1];
    if (int64Fields.get(`${paramsType}::${field}`) === "required") {
      const before = `@core.any(params.${field})`;
      const after = `@core.any(int64_bind_safe(params.${field}))`;
      if (updated.includes(before)) {
        unwrappedSites.push(`${fnName} :: ${paramsType}.${field}`);
        updated = updated.replaceAll(before, after);
        edits += 1;
      }
    }
  }
  // (2) Optional `Int64?` fields: rewrite the Some arm so the unwrapped
  // `v` is wrapped before bind. The None arm stays as @core.null().
  for (
    const optMatch of [
      ...block.matchAll(
        /\(match params\.(\w+) \{ Some\(v\) => @core\.any\(v\); None => @core\.null\(\) \}\)/g,
      ),
    ]
  ) {
    const field = optMatch[1];
    if (int64Fields.get(`${paramsType}::${field}`) === "optional") {
      const before = optMatch[0];
      const after =
        `(match params.${field} { Some(v) => @core.any(int64_bind_safe(v)); None => @core.null() })`;
      if (updated.includes(before)) {
        unwrappedSites.push(`${fnName} :: ${paramsType}.${field}?`);
        updated = updated.replaceAll(before, after);
        edits += 1;
      }
    }
  }
  return updated;
});
patched = rewrittenBlocks.join("");

const helperPresent = patched.includes("extern \"js\" fn int64_bind_safe(");

if (mode === "verify") {
  // Verify mode: file must already be patched. Report any unwrapped sites
  // and missing helper. Do not write.
  const problems = [];
  if (edits > 0) {
    problems.push(
      `${edits} unwrapped Int64 bind site(s) found:\n` +
        unwrappedSites.map((s) => `    - ${s}`).join("\n"),
    );
  }
  if (!helperPresent) {
    problems.push(
      "int64_bind_safe helper extern is missing from sqlc_queries.mbt " +
        "(should be inserted by `node scripts/patch-int64-binds.ts`).",
    );
  }
  if (problems.length > 0) {
    console.error(
      "patch-int64-binds --verify FAILED:\n  " + problems.join("\n  ") +
        "\n\nRun `pnpm run db:generate` (which chains sqlc generate + this " +
        "patch in apply mode) and commit the result.\n\n" +
        "Why this gate exists: docs/regression/worker-deploy.md §Int64-bind hang — passing `@core.any(Int64)` to " +
        "D1 `.bind()` sends a JS BigInt, which causes `.all()` to never " +
        "resolve and the Worker hangs (1101 code had hung). See " +
        "docs/regression/worker-deploy.md §9.",
    );
    process.exit(1);
  }
  console.log(
    `patch-int64-binds --verify: OK (${int64Fields.size} Int64 fields ` +
      `scanned, helper extern present, no unwrapped bind sites).`,
  );
  process.exit(0);
}

if (edits === 0 && helperPresent) {
  console.log(
    `patch-int64-binds: no Int64 bind sites needed patching ` +
      `(checked ${int64Fields.size} Int64 fields, helper already present)`,
  );
  process.exit(0);
}

// Inject the int64_bind_safe extern at the top of the gen file, just
// after the file's leading comment block. The helper must live INSIDE
// the gen package because `pub async fn` bodies in the same file are
// the only consumers and MoonBit package visibility doesn't carry from
// the parent.
const helperBlock =
  `///|\n` +
  `/// Patched in by scripts/patch-int64-binds.ts after every \`sqlc generate\`.\n` +
  `/// Wraps Int64 values as JS Number before passing them to D1.bind() so\n` +
  `/// the BigInt → bind hang (docs/regression/worker-deploy.md §Int64-bind hang) doesn't recur. See ../db_bind_safe.mbt\n` +
  `/// for the long-form note and the upstream sqlc-gen-moonbit issue.\n` +
  `extern "js" fn int64_bind_safe(value : Int64) -> @core.Any =\n` +
  `  #| (n) => Number(n)\n\n`;

if (!helperPresent) {
  // Insert after the file's banner comment + helper preamble. The gen
  // file starts with `// Generated...` then has `///| Read a required...`
  // doc — we insert right before that doc.
  const insertPoint = patched.indexOf("///| Read a required");
  if (insertPoint < 0) {
    console.error(
      "patch-int64-binds: could not find expected insertion point in " +
        "sqlc_queries.mbt (`///| Read a required`). The generator output " +
        "structure changed; update this script.",
    );
    process.exit(2);
  }
  patched = patched.slice(0, insertPoint) + helperBlock + patched.slice(insertPoint);
}

writeFileSync(queriesPath, patched);
console.log(
  `patch-int64-binds: wrapped ${edits} Int64 bind site(s) with ` +
    `int64_bind_safe(). ${int64Fields.size} Int64 fields scanned across ` +
    `Params structs.`,
);
