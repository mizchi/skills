"""Tests for compare_runs.py. Run: python3 hyperfine-benchmark/scripts/test_compare_runs.py"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("compare_runs.py")


def result(command, wall, instructions=None):
    """A schema-2 result whose runs have the given wall-clock values (and optional instruction counts)."""
    runs = []
    for i, w in enumerate(wall):
        m = {"time_wall_clock": {"value": w, "unit": "second"}, "exit_code": 0}
        if instructions is not None:
            m["instructions"] = {"value": instructions[i]}
        runs.append(m)
    return {"command": command, "measurements": runs, "summary": {}}


def export(*results, schema=2):
    return {"schema_version": schema, "primary_metric": "time_wall_clock", "metadata": {}, "results": list(results)}


def run(*docs, args=()):
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for i, doc in enumerate(docs):
            p = Path(tmp) / f"r{i}.json"
            p.write_text(json.dumps(doc))
            paths.append(str(p))
        proc = subprocess.run([sys.executable, str(SCRIPT), *paths, *args], capture_output=True, text=True)
        return proc.returncode, proc.stdout + proc.stderr


STEADY = [1.00, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 1.01]


class SingleFile(unittest.TestCase):
    def test_no_change_passes(self):
        code, out = run(export(result("base", STEADY), result("head", STEADY)))
        self.assertEqual(code, 0, out)

    def test_regression_beyond_threshold_fails(self):
        slower = [v * 1.20 for v in STEADY]
        code, out = run(export(result("base", STEADY), result("head", slower)))
        self.assertEqual(code, 1, out)
        self.assertIn("head", out)
        self.assertIn("+20.0%", out)

    def test_improvement_passes(self):
        faster = [v * 0.7 for v in STEADY]
        code, out = run(export(result("base", STEADY), result("head", faster)))
        self.assertEqual(code, 0, out)

    def test_small_change_within_threshold_passes(self):
        code, out = run(export(result("base", STEADY), result("head", [v * 1.02 for v in STEADY])), args=["--threshold", "0.05"])
        self.assertEqual(code, 0, out)

    def test_noisy_measurement_is_inconclusive_not_pass(self):
        noisy = [1.0, 1.6, 0.8, 1.9, 0.9, 1.5, 0.7, 2.0]
        code, out = run(export(result("base", noisy), result("head", [v * 1.08 for v in noisy])))
        self.assertEqual(code, 2, out)
        self.assertIn("inconclusive", out)

    def test_selects_metric(self):
        # Wall clock is noisy, instructions are steady and 10% higher: judged on instructions.
        noisy = [1.0, 1.6, 0.8, 1.9, 0.9, 1.5, 0.7, 2.0]
        base = result("base", noisy, instructions=[1000] * 8)
        head = result("head", noisy, instructions=[1100] * 8)
        code, out = run(export(base, head), args=["--metric", "instructions"])
        self.assertEqual(code, 1, out)
        self.assertIn("instructions", out)

    def test_missing_metric_is_an_error(self):
        code, out = run(export(result("base", STEADY), result("head", STEADY)), args=["--metric", "instructions"])
        self.assertEqual(code, 3, out)
        self.assertIn("instructions", out)


class TwoFiles(unittest.TestCase):
    def test_matches_commands_by_name(self):
        base = export(result("build", STEADY), result("lint", STEADY))
        head = export(result("lint", STEADY), result("build", [v * 1.3 for v in STEADY]))
        code, out = run(base, head)
        self.assertEqual(code, 1, out)
        self.assertIn("build", out)

    def test_command_missing_from_baseline_is_reported(self):
        code, out = run(export(result("build", STEADY)), export(result("build", STEADY), result("new", STEADY)))
        self.assertEqual(code, 0, out)
        self.assertIn("new", out)


class Schema(unittest.TestCase):
    def test_schema_1_export_is_rejected_with_migration_hint(self):
        old = {"results": [{"command": "x", "mean": 1.0, "times": [1.0]}]}
        code, out = run(old)
        self.assertEqual(code, 3, out)
        self.assertIn("schema", out)


if __name__ == "__main__":
    unittest.main()
