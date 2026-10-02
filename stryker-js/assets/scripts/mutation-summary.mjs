import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const statuses = [
  "Killed",
  "Timeout",
  "Survived",
  "NoCoverage",
  "CompileError",
  "RuntimeError",
  "Ignored",
  "Pending",
];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Summarize a Stryker JSON report for AI review; keep invalid/ignored/pending outcomes visible. */
export function summarizeMutationReport(report) {
  if (!isObject(report) || !isObject(report.files))
    throw new Error("Invalid mutation report: files must be an object.");
  const tests = new Map();
  for (const [file, result] of Object.entries(report.testFiles ?? {})) {
    for (const test of result.tests ?? [])
      tests.set(test.id, { id: test.id, file, name: test.name, location: test.location });
  }
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const findings = [];
  for (const [file, result] of Object.entries(report.files)) {
    if (!Array.isArray(result?.mutants))
      throw new Error(`Invalid mutation report: missing mutants in ${file}.`);
    for (const mutant of result.mutants) {
      if (!Object.hasOwn(counts, mutant.status))
        throw new Error(`Unknown mutant status: ${mutant.status}`);
      counts[mutant.status]++;
      if (["Killed", "Ignored"].includes(mutant.status)) continue;
      const line = mutant.location?.start?.line;
      findings.push({
        id: mutant.id,
        file,
        line,
        location: mutant.location,
        status: mutant.status,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        source:
          typeof result.source === "string" && line
            ? result.source
                .split(/\r?\n/)
                .slice(line - 1, mutant.location.end.line)
                .join("\n")
            : undefined,
        statusReason: mutant.statusReason,
        coveredBy: (mutant.coveredBy ?? []).map((id) => tests.get(id) ?? { id }),
        killedBy: (mutant.killedBy ?? []).map((id) => tests.get(id) ?? { id }),
      });
    }
  }
  const detected = counts.Killed + counts.Timeout;
  const valid = detected + counts.Survived + counts.NoCoverage;
  return {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    detected,
    valid,
    mutationScore: valid ? (detected / valid) * 100 : null,
    complete: counts.Pending === 0,
    findings,
  };
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h", default: false } },
  });
  if (values.help) {
    console.log("Usage: node scripts/mutation-summary.mjs [reports/mutation/mutation.json]");
    return;
  }
  if (positionals.length > 1) throw new Error("Provide one mutation report path.");
  const file = positionals[0] ?? "reports/mutation/mutation.json";
  const report = JSON.parse(await readFile(file, "utf8"));
  console.log(JSON.stringify({ report: file, ...summarizeMutationReport(report) }, null, 2));
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
