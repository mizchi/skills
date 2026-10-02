import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { collectGitChanges, planMutation } from "./mutation-plan.mjs";

export async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      config: { type: "string", default: "stryker.config.json" },
      list: { type: "boolean", default: false },
      "diff-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      "Usage: node scripts/mutation-changed.mjs [--base <ref>] [--config <json>] [--diff-only] [--list]",
    );
    console.log(
      "Default: HEAD vs worktree (staged, unstaged, untracked). --base: merge-base vs worktree.",
    );
    console.log(
      "--diff-only never expands to all source for test/config changes. --list is read-only.",
    );
    return;
  }
  const directory = process.cwd();
  const reports = join(directory, "reports/mutation");
  if (!values.list) {
    await mkdir(reports, { recursive: true });
    // Clear previous results before config/Git inspection so failures cannot expose a stale success.
    for (const name of ["changed-plan.json", "changed.html", "changed.json"])
      await rm(join(reports, name), { force: true });
  }
  const configFile = resolve(directory, values.config);
  if (!configFile.endsWith(".json"))
    throw new Error("The diff selector requires a JSON Stryker config.");
  const config = JSON.parse(await readFile(configFile, "utf8"));
  const { head, comparison, changes } = collectGitChanges(directory, values.base, config.mutate);
  const plan = planMutation(changes, config.mutate, { diffOnly: values["diff-only"] });
  const selection = {
    head,
    base: values.base ?? "HEAD",
    comparison,
    diffOnly: values["diff-only"],
    ...plan,
    changedFiles: changes.map(({ path, status }) => ({ path, status })),
  };
  const json = `${JSON.stringify(selection, null, 2)}\n`;
  if (values.list) {
    console.log(json.trimEnd());
    return;
  }
  await writeFile(join(reports, "changed-plan.json"), json);
  if (plan.scope === "none") {
    console.log("No changed mutation targets. Skipped; test quality was not measured.");
    return;
  }
  console.log(`Mutation scope: ${plan.scope}\n${plan.mutate.join("\n")}`);
  for (const reason of plan.reasons) console.log(reason);
  const { Stryker } = await import("@stryker-mutator/core");
  await new Stryker({
    configFile,
    mutate: plan.mutate,
    incremental: false,
    htmlReporter: { fileName: "reports/mutation/changed.html" },
    jsonReporter: { fileName: "reports/mutation/changed.json" },
  }).runMutationTest();
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
