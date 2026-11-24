"""Tests for check_bazel_hygiene.py. Run: python3 bazel-build-cache/scripts/test_check_bazel_hygiene.py"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("check_bazel_hygiene.py")

CLEAN = {
    ".bazelversion": "9.3.3\n",
    "MODULE.bazel": 'module(name = "x")\n',
    "MODULE.bazel.lock": "{}\n",
    ".bazelrc": "common:ci --lockfile_mode=error\ntry-import %workspace%/.bazelrc.user\n",
    "BUILD.bazel": 'sh_test(name = "t", srcs = ["t.sh"], tags = ["manual"])\n',
    # Unrelated control: words that look risky outside Bazel files must not count.
    "README.md": "We never use no-sandbox or --spawn_strategy=local or curl in genrules.\n",
}


def run(files):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for rel, text in files.items():
            if text is None:
                continue
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(root)], capture_output=True, text=True
        )
        return proc.returncode, proc.stdout + proc.stderr


def with_(**changes):
    files = dict(CLEAN)
    for key, value in changes.items():
        files[key.replace("__", "/").replace("_dot_", ".")] = value
    return files


class Clean(unittest.TestCase):
    def test_clean_repo_passes(self):
        code, out = run(CLEAN)
        self.assertEqual(code, 0, out)

    def test_allow_comment_with_reason_passes(self):
        code, out = run(with_(**{"BUILD.bazel": 'sh_test(name = "t", tags = ["no-sandbox"])  # bazel-hygiene: allow needs /dev/kvm\n'}))
        self.assertEqual(code, 0, out)

    def test_curl_outside_genrule_passes(self):
        code, out = run(with_(**{"tools/BUILD.bazel": 'sh_binary(name = "fetch", srcs = ["fetch.sh"])  # runs curl at bazel run time\n'}))
        self.assertEqual(code, 0, out)


class Bad(unittest.TestCase):
    def assertFinding(self, files, needle):
        code, out = run(files)
        self.assertEqual(code, 1, out)
        self.assertIn(needle, out)

    def test_workspace_file(self):
        self.assertFinding(with_(**{"WORKSPACE.bazel": ""}), "WORKSPACE")

    def test_missing_bazelversion(self):
        self.assertFinding(with_(**{".bazelversion": None}), ".bazelversion")

    def test_missing_lockfile(self):
        self.assertFinding(with_(**{"MODULE.bazel.lock": None}), "MODULE.bazel.lock")

    def test_no_sandbox_tag(self):
        self.assertFinding(with_(**{"pkg/BUILD.bazel": 'genrule(name = "g", outs = ["o"], cmd = "touch $@", tags = ["no-sandbox"])\n'}), "no-sandbox")

    def test_no_cache_tag_in_multiline_list(self):
        self.assertFinding(with_(**{"pkg/BUILD": 'py_test(\n    name = "t",\n    tags = [\n        "no-cache",\n    ],\n)\n'}), "no-cache")

    def test_allow_comment_without_reason_still_fails(self):
        self.assertFinding(with_(**{"BUILD.bazel": 'sh_test(name = "t", tags = ["local"])  # bazel-hygiene: allow\n'}), "local")

    def test_local_spawn_strategy_in_bazelrc(self):
        self.assertFinding(with_(**{".bazelrc": "build --spawn_strategy=local\n"}), "spawn_strategy")

    def test_per_mnemonic_local_strategy(self):
        self.assertFinding(with_(**{".bazelrc": "build --strategy=TsProject=local\n"}), "strategy")

    def test_strict_action_env_disabled(self):
        self.assertFinding(with_(**{".bazelrc": "build --noincompatible_strict_action_env\n"}), "strict_action_env")

    def test_host_path_leak(self):
        self.assertFinding(with_(**{".bazelrc": "build --action_env=PATH\n"}), "action_env=PATH")

    def test_network_in_genrule(self):
        self.assertFinding(with_(**{"pkg/BUILD.bazel": 'genrule(\n    name = "g",\n    outs = ["o"],\n    cmd = "curl -sSL https://example.com > $@",\n)\n'}), "network")


if __name__ == "__main__":
    unittest.main()
