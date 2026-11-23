#!/usr/bin/env python3
"""Tests for gen_catalog.py and fetch_skill.sh. Run: python3 mizchi-skill/scripts/test_catalog.py"""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "gen_catalog.py")
FETCH = os.path.join(HERE, "fetch_skill.sh")


def skill(root, name, desc):
    os.makedirs(os.path.join(root, name), exist_ok=True)
    with open(os.path.join(root, name, "SKILL.md"), "w") as f:
        f.write(f"---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n")


def repo(tmp):
    root = os.path.join(tmp, "skills")
    skill(root, "alpha", "Use when deploying alpha things.")
    skill(root, "beta", "Use when testing beta. " + "Long detail. " * 40)
    skill(root, "gamma-meta", "Meta-skill. Invoke ONLY when the user explicitly asks for gamma.")
    skill(root, "mizchi-skill", "The router itself.")
    skill(root, "delta-opt", "Use for Nix. Use devbox only when the project already uses it or the user explicitly selects it.")
    os.makedirs(os.path.join(root, "_tmp_upstream", "zeta"))
    with open(os.path.join(root, "README.md"), "w") as f:
        f.write("# skills\n\n## Skills\n\n### Deploy\n\n| Skill | Install path | Description |\n| --- | --- | --- |\n"
                "| [alpha](alpha/) | `alpha` | Ship alpha to production. |\n\n## Tools\n\nnot skills\n")
    return root


class Catalog(unittest.TestCase):
    def gen(self, root, *extra):
        return subprocess.run([sys.executable, GEN, "--root", root, *extra], capture_output=True, text=True)

    def test_lists_every_skill_once_with_short_descriptions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = repo(tmp)
            r = self.gen(root, "--stdout")
            self.assertEqual(r.returncode, 0, r.stderr)
            out = r.stdout
            self.assertIn("### Deploy", out)
            self.assertIn("| `alpha` | Ship alpha to production. |", out)  # README wording wins
            self.assertIn("`beta`", out)  # not in README: from SKILL.md, shortened
            beta = next(l for l in out.splitlines() if "`beta`" in l)
            self.assertLess(len(beta), 260)
            self.assertNotIn("`mizchi-skill`", out)  # not itself
            self.assertNotIn("zeta", out)  # only directories with SKILL.md
            self.assertEqual(out.count("`alpha`"), 1)

    def test_marks_explicit_only_skills(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = self.gen(repo(tmp), "--stdout").stdout
            gamma = next(l for l in out.splitlines() if "`gamma-meta`" in l)
            self.assertNotIn("explicit only", next(l for l in out.splitlines() if "`delta-opt`" in l))
            self.assertIn("explicit only", gamma)
            alpha = next(l for l in out.splitlines() if "`alpha`" in l)
            self.assertNotIn("explicit only", alpha)

    def test_check_mode_detects_a_stale_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = repo(tmp)
            os.makedirs(os.path.join(root, "mizchi-skill", "references"))
            self.assertEqual(self.gen(root).returncode, 0)
            self.assertEqual(self.gen(root, "--check").returncode, 0)
            skill(root, "delta", "Use when delta.")
            self.assertEqual(self.gen(root, "--check").returncode, 1)


class Fetch(unittest.TestCase):
    def test_prints_the_skill_directory_from_a_local_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = repo(tmp)
            env = dict(os.environ, MIZCHI_SKILLS_DIR=root, HOME=tmp)
            r = subprocess.run(["bash", FETCH, "alpha"], capture_output=True, text=True, env=env)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), os.path.join(root, "alpha"))

    def test_prefers_an_installed_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = repo(tmp)
            skill(os.path.join(tmp, ".claude", "skills"), "alpha", "installed")
            env = dict(os.environ, MIZCHI_SKILLS_DIR=root, HOME=tmp)
            r = subprocess.run(["bash", FETCH, "alpha"], capture_output=True, text=True, env=env, cwd=tmp)
            self.assertEqual(os.path.realpath(r.stdout.strip()), os.path.realpath(os.path.join(tmp, ".claude", "skills", "alpha")))

    def test_unknown_skill_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, MIZCHI_SKILLS_DIR=repo(tmp), HOME=tmp)
            r = subprocess.run(["bash", FETCH, "nope"], capture_output=True, text=True, env=env)
            self.assertNotEqual(r.returncode, 0)
            r = subprocess.run(["bash", FETCH, "../alpha"], capture_output=True, text=True, env=env)
            self.assertNotEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
