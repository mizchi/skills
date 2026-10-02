import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifyInstalledSkill } from "../scripts/verify-installed-skill.mjs";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "skill-publish-verify-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, "source");
  const installed = join(directory, "installed");
  for (const root of [source, installed]) {
    mkdirSync(join(root, "assets/nested"), { recursive: true });
    mkdirSync(join(root, "references"));
    writeFileSync(
      join(root, "SKILL.md"),
      "---\nname: sample-skill\ndescription: Check a sample.\n---\nSample.\n",
    );
    writeFileSync(join(root, "assets/nested/template.json"), '{"name":"sample"}\n');
    writeFileSync(join(root, "references/setup.md"), "Read this setup.\n");
  }
  return { source, installed };
}

test("verifies the entrypoint and all packaged resources", (t) => {
  const { source, installed } = fixture(t);
  writeFileSync(join(installed, ".installer-metadata.json"), "{}");
  assert.equal(verifyInstalledSkill(source, installed).filesChecked, 3);
});

test("an installer dropping an asset is a failure", (t) => {
  const { source, installed } = fixture(t);
  rmSync(join(installed, "assets/nested/template.json"));
  assert.throws(() => verifyInstalledSkill(source, installed), /assets\/nested\/template.json/);
});

test("stale instructions or changed references are failures", (t) => {
  const { source, installed } = fixture(t);
  writeFileSync(join(installed, "references/setup.md"), "Old version.\n");
  writeFileSync(join(installed, "SKILL.md"), "Stale entrypoint.\n");
  assert.throws(() => verifyInstalledSkill(source, installed), /SKILL.md.*references\/setup.md/s);
});

test("verifies resources through an installed symlink", (t) => {
  const { source, installed } = fixture(t);
  rmSync(installed, { recursive: true });
  symlinkSync(source, installed, "dir");
  assert.equal(verifyInstalledSkill(source, installed).filesChecked, 3);
});

test("missing source entrypoint cannot pass as an empty package", (t) => {
  const { source, installed } = fixture(t);
  rmSync(join(source, "SKILL.md"));
  assert.throws(() => verifyInstalledSkill(source, installed), /SKILL.md/);
});

test("packaging tests and READMEs are not required runtime resources", (t) => {
  const { source, installed } = fixture(t);
  mkdirSync(join(source, "tests"));
  writeFileSync(join(source, "tests/test.mjs"), "source tests");
  writeFileSync(join(source, "README.md"), "install guide");
  assert.equal(verifyInstalledSkill(source, installed).filesChecked, 3);
});

test("CLI succeeds for an identical package and fails for a missing resource", (t) => {
  const { source, installed } = fixture(t);
  const script = fileURLToPath(new URL("../scripts/verify-installed-skill.mjs", import.meta.url));
  const run = () => spawnSync(process.execPath, [script, source, installed], { encoding: "utf8" });
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).filesChecked, 3);
  rmSync(join(installed, "SKILL.md"));
  const bad = run();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /SKILL.md/);
});
