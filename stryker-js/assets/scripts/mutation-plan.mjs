import { execFileSync } from "node:child_process";
import { matchesGlob } from "node:path";

/** @typedef {{path: string, status: 'added'|'modified'|'deleted', patch: string}} FileChange */
/** @typedef {{scope: 'all'|'changed'|'none', mutate: string[], reasons: string[]}} MutationPlan */

function sourceMatcher(patterns) {
  const invalidPattern = (pattern) => {
    if (typeof pattern !== "string" || !pattern || /[:\\\r\n]/.test(pattern)) return true;
    const glob = pattern.replace(/^!/, "");
    return !glob || glob.startsWith("/") || glob.split("/").includes("..");
  };
  if (
    !Array.isArray(patterns) ||
    !patterns.length ||
    patterns.some(invalidPattern) ||
    !patterns.some((pattern) => !pattern.startsWith("!"))
  ) {
    throw new Error(
      "mutate must contain relative glob patterns and a positive include; ranges are CLI-only.",
    );
  }
  const includes = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excludes = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  return (path) =>
    includes.some((pattern) => matchesGlob(path, pattern)) &&
    !excludes.some((pattern) => matchesGlob(path, pattern));
}

function changesValidation(path) {
  return (
    /(^|\/)(test|tests|__tests__|__mocks__)\//.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(path) ||
    /(^|\/)(vite|vitest|stryker)\.config(?:\.[^/]+)?\.[cm]?[jt]s$/.test(path) ||
    /(^|\/)stryker\.config\.json$/.test(path) ||
    /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path)
  );
}

/** Select new-side Git hunks as inclusive, 1-based Stryker ranges.
 * @param {FileChange[]} changes
 * @param {string[]} patterns
 * @param {{diffOnly?: boolean}} options
 * @returns {MutationPlan}
 */
export function planMutation(changes, patterns, { diffOnly = false } = {}) {
  const isSource = sourceMatcher(patterns);
  const validation = changes.filter((change) => changesValidation(change.path));
  if (!diffOnly && validation.length) {
    return {
      scope: "all",
      mutate: [...patterns],
      reasons: validation.map(
        (change) =>
          `${change.path}: tests/configuration/dependencies changed; reevaluate all source`,
      ),
    };
  }
  const mutate = [];
  const reasons = [];
  for (const change of changes) {
    if (change.status === "deleted" || !isSource(change.path)) continue;
    if (/[*?[\]{}()!:\\\r\n]/.test(change.path)) {
      throw new Error(
        `Cannot express a literal Stryker path without glob/range ambiguity: ${change.path}`,
      );
    }
    const hunks = [...change.patch.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)];
    const shrinks = hunks.some((match) => Number(match[1] ?? 1) > Number(match[3] ?? 1));
    if (change.status === "added" || shrinks || hunks.length === 0) {
      mutate.push(change.path);
      reasons.push(
        `${change.path}: added, shortened, or no line range; reevaluate this changed file`,
      );
    } else {
      for (const match of hunks) {
        const start = Number(match[2]);
        const count = Number(match[3] ?? 1);
        if (count > 0) mutate.push(`${change.path}:${start}-${start + count - 1}`);
      }
    }
  }
  return { scope: mutate.length ? "changed" : "none", mutate, reasons };
}

/** Read-only Git inspection; filenames/ref arguments never pass through a shell.
 * @param {string} directory Repository root (run project commands from here).
 * @param {string|undefined} base Without base: HEAD vs worktree. With base: merge-base vs worktree.
 * @param {string[]} patterns
 * @returns {{head: string, comparison: string, changes: FileChange[]}}
 */
export function collectGitChanges(directory, base, patterns) {
  const isSource = sourceMatcher(patterns);
  function git(...args) {
    try {
      return execFileSync("git", ["-C", directory, ...args], {
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (cause) {
      throw new Error(`git ${args.join(" ")} failed; check the ref, history and repository.`, {
        cause,
      });
    }
  }
  const head = git("rev-parse", "--verify", "HEAD^{commit}").trim();
  const commit = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${base ?? "HEAD"}^{commit}`,
  ).trim();
  const comparison = base === undefined ? head : git("merge-base", head, commit).trim();
  const diffOptions = ["--no-renames", "--no-ext-diff", "--no-textconv"];
  const entries = git("diff", "--name-status", "-z", ...diffOptions, comparison, "--")
    .split("\0")
    .filter(Boolean);
  const changes = [];
  for (let i = 0; i < entries.length; i += 2) {
    const [status, path] = entries.slice(i, i + 2);
    if (!path || !["A", "M", "D", "T"].includes(status)) {
      throw new Error(
        `Unsupported git diff state ${status} ${path ?? ""}; resolve conflicts first.`,
      );
    }
    changes.push({
      path,
      status: status === "A" ? "added" : status === "D" ? "deleted" : "modified",
      patch:
        ["M", "T"].includes(status) && isSource(path)
          ? git(
              "diff",
              "--unified=0",
              "--no-color",
              ...diffOptions,
              comparison,
              "--",
              `:(literal)${path}`,
            )
          : "",
    });
  }
  for (const path of git("ls-files", "--others", "--exclude-standard", "-z").split("\0")) {
    if (path) changes.push({ path, status: "added", patch: "" });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { head, comparison, changes };
}
