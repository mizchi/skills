import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Compare the portable entrypoint and standard runtime resources against an installation.
 * @param {string} source Source skill directory, at the revision being verified.
 * @param {string} installed Actual installed skill directory (may itself be a symlink).
 * @returns {{source: string, installed: string, filesChecked: number}}
 */
export function verifyInstalledSkill(source, installed) {
  source = resolve(source);
  installed = resolve(installed);
  const files = ["SKILL.md"];
  function collect(relative) {
    for (const entry of readdirSync(join(source, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) collect(path);
      else files.push(path);
    }
  }
  for (const directory of ["references", "scripts", "assets", "agents"]) {
    if (existsSync(join(source, directory))) collect(directory);
  }
  const mismatches = [];
  for (const path of files) {
    const expected = readFileSync(join(source, path));
    let actual;
    try {
      actual = readFileSync(join(installed, path));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mismatches.push(`${path}: missing`);
      continue;
    }
    if (!expected.equals(actual)) mismatches.push(`${path}: content differs`);
  }
  if (mismatches.length)
    throw new Error(`Installed skill differs from source:\n${mismatches.join("\n")}`);
  return { source, installed, filesChecked: files.length };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        "Usage: node verify-installed-skill.mjs <source-skill-dir> <installed-skill-dir>",
      );
    console.log(JSON.stringify(verifyInstalledSkill(process.argv[2], process.argv[3]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
