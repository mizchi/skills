#!/usr/bin/env python3
"""Tests for kpi_backfill.py and validate_retro.py. Run: python3 repo-retrospective/scripts/test_scripts.py"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKFILL = os.path.join(HERE, "kpi_backfill.py")
VALIDATE = os.path.join(HERE, "validate_retro.py")


def sh(cwd, *args, env=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=env)


def toy_repo(tmp):
    """Three commits; n.txt holds 1, 2, then a non-number (the measure fails there)."""
    repo = os.path.join(tmp, "repo")
    os.makedirs(repo)
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    sh(repo, "git", "init", "-q", "-b", "main", env=env)
    hashes = []
    for i, v in enumerate(["1", "2", "oops"]):
        with open(os.path.join(repo, "n.txt"), "w") as f:
            f.write(v + "\n")
        env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = f"2026-01-0{i + 1}T00:00:00+09:00"
        sh(repo, "git", "add", "n.txt", env=env)
        sh(repo, "git", "commit", "-q", "-m", f"c{i}", env=env)
        hashes.append(sh(repo, "git", "rev-parse", "HEAD").stdout.strip())
    return repo, hashes


MEASURE = 'v=$(cat n.txt); case "$v" in *[!0-9]*) echo bad >&2; exit 3;; esac; echo "size $v lines"; echo "double $((v*2))"'


class Backfill(unittest.TestCase):
    def test_measures_each_commit_and_records_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, hs = toy_repo(tmp)
            out = os.path.join(tmp, "kpi.json")
            r = sh(tmp, sys.executable, BACKFILL, "-C", repo, "--commits", ",".join(hs), "--measure", MEASURE, "--out", out)
            self.assertEqual(r.returncode, 0, r.stderr)
            rows = json.load(open(out))
            got = {(x["commit"], x["metric"]): x for x in rows}
            self.assertEqual(got[(hs[0][:8], "size")]["value"], 1)
            self.assertEqual(got[(hs[0][:8], "size")]["unit"], "lines")
            self.assertEqual(got[(hs[1][:8], "double")]["value"], 4)
            self.assertTrue(all(x["provenance"] == "remeasured" for x in rows))
            self.assertEqual(rows[0]["time"], "2025-12-31T15:00:00Z")  # author time, in UTC
            self.assertFalse(any(x["commit"] == hs[2][:8] for x in rows))
            log = json.load(open(out + ".log.json"))
            self.assertEqual(log[hs[2][:8]]["status"], "measure-failed")
            self.assertEqual(log[hs[0][:8]]["status"], "ok")
            # the worktrees are gone
            self.assertEqual(sh(repo, "git", "worktree", "list").stdout.count("\n"), 1)

    def test_resumes_without_measuring_again(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, hs = toy_repo(tmp)
            out = os.path.join(tmp, "kpi.json")
            sh(tmp, sys.executable, BACKFILL, "-C", repo, "--commits", hs[0], "--measure", MEASURE, "--out", out)
            marker = os.path.join(tmp, "ran")
            r = sh(tmp, sys.executable, BACKFILL, "-C", repo, "--commits", f"{hs[0]},{hs[1]}",
                   "--measure", f"echo x >> {marker}; " + MEASURE, "--out", out)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(open(marker).read().count("x"), 1)  # only hs[1] ran
            self.assertEqual({x["commit"] for x in json.load(open(out))}, {hs[0][:8], hs[1][:8]})

    def test_json_measure_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, hs = toy_repo(tmp)
            out = os.path.join(tmp, "kpi.json")
            m = """echo '[{"name": "build ms", "value": 12.5, "unit": "ms"}, {"name": "rss", "value": 3, "unit": "MiB"}]'"""
            r = sh(tmp, sys.executable, BACKFILL, "-C", repo, "--commits", hs[1], "--measure", m, "--parse", "json", "--out", out)
            self.assertEqual(r.returncode, 0, r.stderr)
            got = {x["metric"]: x for x in json.load(open(out))}
            self.assertEqual(got["build ms"]["value"], 12.5)
            self.assertEqual(got["rss"]["unit"], "MiB")


def write_retro(d, manifest, datasets):
    os.makedirs(d, exist_ok=True)
    for name, data in [("manifest", manifest), *datasets.items()]:
        with open(os.path.join(d, f"{name}.json"), "w") as f:
            json.dump(data, f)


def good():
    m = {
        "contract": "repo-retrospective/v1", "repo": "o/r", "head": "abcdef12", "generated_at": "2026-01-01T00:00:00Z",
        "generator": "x.py",
        "datasets": {
            "milestones": {"file": "milestones.json", "grain": "one decision", "provenance": "hand-picked",
                           "columns": {"time": {"type": "time"}, "commit": {"type": "commit"}, "label": {"type": "string"},
                                       "detail": {"type": "string"}}},
            "kpi": {"file": "kpi.json", "grain": "one metric at one commit", "provenance": "mixed",
                    "columns": {"time": {"type": "time"}, "commit": {"type": "commit"}, "metric": {"type": "string"},
                                "value": {"type": "number", "nullable": True}, "unit": {"type": "string"},
                                "provenance": {"type": "enum", "values": ["recorded", "remeasured"]}}},
        },
    }
    d = {
        "milestones": [{"time": "2026-01-01T00:00:00Z", "commit": "abcdef12", "label": "Start", "detail": "first"}],
        "kpi": [{"time": "2026-01-01T00:00:00Z", "commit": "abcdef12", "metric": "build", "value": 1.5, "unit": "ms", "provenance": "recorded"},
                {"time": "2026-01-02T00:00:00Z", "commit": "abcdef13", "metric": "build", "value": None, "unit": "ms", "provenance": "remeasured"}],
    }
    return m, d


class Validate(unittest.TestCase):
    def run_v(self, m, d):
        with tempfile.TemporaryDirectory() as tmp:
            write_retro(tmp, m, d)
            return sh(tmp, sys.executable, VALIDATE, tmp)

    def test_accepts_a_valid_directory(self):
        r = self.run_v(*good())
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_problems(self):
        cases = {
            "undeclared column": lambda m, d: d["kpi"][0].update(extra=1),
            "missing column": lambda m, d: d["milestones"][0].pop("detail"),
            "bad time": lambda m, d: d["kpi"][0].update(time="2026-01-01 09:00+09:00"),
            "bad enum": lambda m, d: d["kpi"][0].update(provenance="guessed"),
            "null not allowed": lambda m, d: d["milestones"][0].update(label=None),
            "unsorted": lambda m, d: d["kpi"].reverse(),
            "mixed without row column": lambda m, d: (m["datasets"]["kpi"]["columns"].pop("provenance"), [r.pop("provenance") for r in d["kpi"]]),
            "no milestones": lambda m, d: (m["datasets"].pop("milestones"), d.pop("milestones")),
            "bad contract": lambda m, d: m.update(contract="v0"),
        }
        for name, mutate in cases.items():
            with self.subTest(name):
                m, d = good()
                mutate(m, d)
                r = self.run_v(m, d)
                self.assertEqual(r.returncode, 1, f"{name}: {r.stdout}{r.stderr}")


if __name__ == "__main__":
    unittest.main()
