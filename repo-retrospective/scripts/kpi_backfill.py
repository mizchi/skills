#!/usr/bin/env python3
"""Measure a project's KPIs again at past commits, for the points its own history did not record.

usage: kpi_backfill.py -C REPO --measure CMD [--setup CMD] (--commits SHA,SHA | --commits-file FILE |
                       --milestones milestones.json | --every-days N) [--include-head] [--parse lines|json]
                       [--timeout SEC] [--out kpi_remeasured.json]

Each commit is checked out in a temporary `git worktree` (the working tree is never touched). --setup runs first
(a build), then --measure, both with `sh -c` in the worktree. The measure command prints its numbers on stdout:
  --parse lines  one metric per line: "<name> <value> [unit]" (the name may contain spaces if the value is the
                 second-to-last or last number on the line)
  --parse json   {"name": value, ...}, or [{"name", "value", "unit"?}, ...] (github-action-benchmark's format)
Output rows (data contract repo-retrospective/v1, dataset kind "kpi"):
  {time (author time, UTC), commit (8 hex), metric, value, unit, provenance: "remeasured"}
--out is rewritten after every commit; commits already in it are skipped, so an interrupted run resumes.
<out>.log.json keeps each commit's status (ok, setup-failed, measure-failed, timeout, unparsed) and stderr tail.
Re-measured numbers come from this machine, not the original one: include HEAD (--include-head) and compare it
with the recorded value at HEAD before putting both on one chart.
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

NUM = re.compile(r"^-?\d+(\.\d+)?([eE][-+]?\d+)?$")


def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout.strip()


def utc(s):
    return dt.datetime.fromisoformat(s).astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def num(s):
    v = float(s)
    return int(v) if v.is_integer() and "." not in s and "e" not in s.lower() else v


def parse_lines(text):
    out = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and NUM.match(parts[-1]):
            out.append((" ".join(parts[:-1]), num(parts[-1]), ""))
        elif len(parts) >= 3 and NUM.match(parts[-2]):
            out.append((" ".join(parts[:-2]), num(parts[-2]), parts[-1]))
    return out


def parse_json(text):
    data = json.loads(text)
    if isinstance(data, dict):
        return [(k, v, "") for k, v in data.items() if isinstance(v, (int, float))]
    return [(d["name"], d["value"], d.get("unit", "")) for d in data if isinstance(d.get("value"), (int, float))]


def pick_commits(a):
    if a.commits:
        shas = [s for s in a.commits.split(",") if s]
    elif a.commits_file:
        shas = [l.split()[0] for l in open(a.commits_file) if l.strip() and not l.startswith("#")]
    elif a.milestones:
        shas = [m["commit"] for m in json.load(open(a.milestones))]
    elif a.every_days:
        shas, last = [], None
        for l in git(a.repo, "log", "--reverse", "--first-parent", "--format=%H %aI", a.rev).splitlines():
            h, d = l.split()
            t = dt.datetime.fromisoformat(d).astimezone(dt.timezone.utc)
            if last is None or (t - last).total_seconds() >= a.every_days * 86400:
                shas.append(h)
                last = t
    else:
        sys.exit("say which commits: --commits, --commits-file, --milestones or --every-days")
    if a.include_head:
        shas.append(git(a.repo, "rev-parse", a.rev))
    full = []
    for s in shas:
        h = git(a.repo, "rev-parse", "--verify", f"{s}^{{commit}}")
        if h not in full:
            full.append(h)
    return full


def run(cmd, cwd, timeout):
    try:
        r = subprocess.run(["sh", "-c", cmd], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired as e:
        return None, e.stdout or "", "timeout"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("-C", dest="repo", default=".")
    ap.add_argument("--rev", default="HEAD")
    ap.add_argument("--commits")
    ap.add_argument("--commits-file")
    ap.add_argument("--milestones")
    ap.add_argument("--every-days", type=float)
    ap.add_argument("--include-head", action="store_true")
    ap.add_argument("--setup", default="")
    ap.add_argument("--measure", required=True)
    ap.add_argument("--parse", choices=("lines", "json"), default="lines")
    ap.add_argument("--timeout", type=int, default=1800)
    ap.add_argument("--out", default="kpi_remeasured.json")
    a = ap.parse_args()
    repo = git(a.repo, "rev-parse", "--show-toplevel")

    rows = json.load(open(a.out)) if os.path.exists(a.out) else []
    log = json.load(open(a.out + ".log.json")) if os.path.exists(a.out + ".log.json") else {}
    done = {r["commit"] for r in rows}
    parse = parse_lines if a.parse == "lines" else parse_json

    def save():
        rows.sort(key=lambda r: (r["time"], r["commit"], r["metric"]))
        with open(a.out, "w") as f:
            json.dump(rows, f, ensure_ascii=False, indent=0)
        with open(a.out + ".log.json", "w") as f:
            json.dump(log, f, ensure_ascii=False, indent=1)

    for h in pick_commits(a):
        short = h[:8]
        if short in done:
            print(f"{short} skip (already measured)", file=sys.stderr)
            continue
        when = utc(git(repo, "log", "-1", "--format=%aI", h))
        wt = tempfile.mkdtemp(prefix="kpi-backfill-")
        try:
            git(repo, "worktree", "add", "-q", "--detach", wt, h)
            status, err = "ok", ""
            if a.setup:
                code, _, err = run(a.setup, wt, a.timeout)
                if code != 0:
                    status = "timeout" if code is None else "setup-failed"
            if status == "ok":
                code, out, err = run(a.measure, wt, a.timeout)
                if code != 0:
                    status = "timeout" if code is None else "measure-failed"
                else:
                    try:
                        got = parse(out)
                    except (ValueError, KeyError, TypeError) as e:
                        got, err = [], f"{e}\n{out[-500:]}"
                    if not got:
                        status = "unparsed"
                    for metric, value, unit in got:
                        rows.append(dict(time=when, commit=short, metric=metric, value=value, unit=unit, provenance="remeasured"))
            log[short] = dict(time=when, status=status, stderr=err[-800:])
            print(f"{short} {when} {status}", file=sys.stderr)
        finally:
            git(repo, "worktree", "remove", "--force", wt, check=False)
            shutil.rmtree(wt, ignore_errors=True)
            git(repo, "worktree", "prune", check=False)
        save()
    save()


if __name__ == "__main__":
    main()
