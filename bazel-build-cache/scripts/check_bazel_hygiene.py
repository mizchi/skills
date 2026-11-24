#!/usr/bin/env python3
"""Fail when a Bazel repository is set up in a way that silently breaks caching.

Usage: python3 check_bazel_hygiene.py [repo-root]

Each finding names what to do instead. A BUILD or .bazelrc line can opt out with
`# bazel-hygiene: allow <reason>`; an allow comment without a reason is ignored.
"""
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules"}
ALLOW = re.compile(r"#\s*bazel-hygiene:\s*allow\s+\S")
BAD_TAGS = {
    "no-sandbox": "fix the undeclared input or output instead; unsandboxed actions are not reproducible",
    "no-cache": "make the action deterministic; an uncached action reruns on every build",
    "no-remote": "make the action deterministic or declare its inputs; it will never hit a shared cache",
    "no-remote-cache": "make the action deterministic or declare its inputs; it will never hit a shared cache",
    "local": "declare the missing inputs; `local` disables sandboxing and caching",
}
TAG_RE = re.compile(r'"(%s)"' % "|".join(re.escape(t) for t in BAD_TAGS))
BAZELRC_RULES = [
    (re.compile(r"--spawn_strategy=\S*\blocal\b"), "--spawn_strategy=local disables the sandbox for every action; fix the failing action instead"),
    (re.compile(r"--strategy=\w+=\S*\blocal\b"), "a per-mnemonic local --strategy hides undeclared inputs; declare them instead"),
    (re.compile(r"--noincompatible_strict_action_env|--incompatible_strict_action_env=(false|0|no)"), "keep --incompatible_strict_action_env on; host env in action keys breaks cache hits across machines"),
    (re.compile(r"--action_env=PATH(\s|$)"), "--action_env=PATH leaks the host PATH into action keys; use a toolchain or a fixed --action_env=PATH=<value>"),
]
NETWORK_RE = re.compile(r"\b(curl|wget|npm (install|ci)|pnpm (install|add)|pip install|go get|git clone)\b")


def bazel_files(root, names):
    for path in root.rglob("*"):
        if path.is_file() and path.name in names and not (SKIP_DIRS & set(path.relative_to(root).parts)) and not path.relative_to(root).parts[0].startswith("bazel-"):
            yield path


def genrule_cmd_lines(text):
    """Yield (line_no, line) for lines inside a genrule(...) call's cmd attributes."""
    depth, in_genrule = 0, False
    for no, line in enumerate(text.splitlines(), 1):
        if not in_genrule and re.match(r"\s*genrule\(", line):
            in_genrule, depth = True, 0
        if in_genrule:
            depth += line.count("(") - line.count(")")
            if re.search(r"\bcmd(_bash|_bat|_ps)?\s*=", line) or (depth > 0 and line.strip().startswith('"')):
                yield no, line
            if depth <= 0:
                in_genrule = False


def check(root):
    findings = []
    rel = lambda p: p.relative_to(root).as_posix()

    for name in ("WORKSPACE", "WORKSPACE.bazel", "WORKSPACE.bzlmod"):
        if (root / name).exists():
            findings.append(f"{name}: remove it; Bazel 9 only reads MODULE.bazel (move repositories to bazel_dep or a module extension)")
    if (root / "MODULE.bazel").exists():
        if not (root / ".bazelversion").exists():
            findings.append(".bazelversion: missing; pin the Bazel version so bazelisk, CI and the cache key agree")
        if not (root / "MODULE.bazel.lock").exists():
            findings.append("MODULE.bazel.lock: missing; commit it and run CI with --lockfile_mode=error")

    for path in bazel_files(root, {"BUILD", "BUILD.bazel"}):
        text = path.read_text(errors="replace")
        lines = text.splitlines()
        for no, line in enumerate(lines, 1):
            if ALLOW.search(line):
                continue
            for match in TAG_RE.finditer(line):
                tag = match.group(1)
                findings.append(f"{rel(path)}:{no}: tag \"{tag}\": {BAD_TAGS[tag]}")
        for no, line in genrule_cmd_lines(text):
            if NETWORK_RE.search(line) and not ALLOW.search(lines[no - 1]):
                findings.append(f"{rel(path)}:{no}: network access in a genrule cmd; fetch it with a module extension or http_file so it is cached and checksummed")

    for path in bazel_files(root, {".bazelrc"}):
        for no, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
            if line.lstrip().startswith("#") or ALLOW.search(line):
                continue
            for pattern, message in BAZELRC_RULES:
                if pattern.search(line):
                    findings.append(f"{rel(path)}:{no}: {message}")
    return findings


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    findings = check(root)
    for finding in findings:
        print(finding)
    if findings:
        print(f"\n{len(findings)} Bazel hygiene finding(s). Opt out per line with `# bazel-hygiene: allow <reason>`.")
        return 1
    print("bazel hygiene ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
