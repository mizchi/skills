#!/usr/bin/env python3
"""Compare hyperfine 2.x JSON exports (schema 2) and fail on a regression.

Usage:
  compare_runs.py results.json [--metric M] [--threshold 0.05]
      every command is compared with the first one (the reference)
  compare_runs.py baseline.json candidate.json [--metric M] [--threshold 0.05]
      commands are matched by name (or command line when unnamed)

Exit codes:
  0  no regression
  1  regression: median change above --threshold and above twice the noise
  2  inconclusive: the noise is too large to tell a change of that size apart
  3  bad input (wrong schema version, missing metric)

Noise is the larger coefficient of variation (stddev / mean) of the two sides.
This is a screening rule, not a significance test; for a p-value run
`uvx --from 'git+https://github.com/sharkdp/hyperfine@v2.0.0' welch_ttest results.json --metric M`.
"""
import argparse
import json
import statistics
import sys


class InputError(Exception):
    pass


def load(path):
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    if doc.get("schema_version") != 2:
        raise InputError(
            f"{path}: expected an hyperfine 2.x export (schema_version 2); got {doc.get('schema_version')!r}. "
            "Re-run with hyperfine 2.0.0 or later; schema 1 used results[i].mean / results[i].times."
        )
    return doc


def label(result):
    return result.get("name") or result["command"]


def values(result, metric, path):
    out = []
    for run in result.get("measurements", []):
        if metric not in run:
            raise InputError(f"{path}: metric {metric!r} missing for {label(result)!r}; was it selected with --metrics?")
        out.append(float(run[metric]["value"]))
    if not out:
        raise InputError(f"{path}: no measurements for {label(result)!r}")
    return out


def cv(xs):
    mean = statistics.fmean(xs)
    if len(xs) < 2 or mean == 0:
        return 0.0
    return statistics.stdev(xs) / mean


def judge(base, head, threshold):
    change = statistics.median(head) / statistics.median(base) - 1
    noise = max(cv(base), cv(head))
    if change > threshold and change > 2 * noise:
        verdict = "regression"
    elif change > threshold or (noise > threshold and abs(change) <= 2 * noise):
        verdict = "inconclusive"
    else:
        verdict = "ok"
    return change, noise, verdict


def pairs(paths, metric):
    if len(paths) == 1:
        doc = load(paths[0])
        results = doc["results"]
        ref = results[0]
        base = values(ref, metric, paths[0])
        for r in results[1:]:
            yield label(r), label(ref), base, values(r, metric, paths[0])
    else:
        base_doc, head_doc = load(paths[0]), load(paths[1])
        baseline = {label(r): r for r in base_doc["results"]}
        for r in head_doc["results"]:
            name = label(r)
            if name not in baseline:
                yield name, None, None, values(r, metric, paths[1])
                continue
            yield name, name, values(baseline[name], metric, paths[0]), values(r, metric, paths[1])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--metric", default=None, help="metric to judge (default: the export's primary metric)")
    ap.add_argument("--threshold", type=float, default=0.05, help="relative change counted as a regression (default 0.05)")
    a = ap.parse_args()
    if len(a.files) > 2:
        ap.error("pass one export (compare with its first command) or two (baseline, candidate)")
    try:
        metric = a.metric or load(a.files[0]).get("primary_metric", "time_wall_clock")
        worst = 0
        for name, ref, base, head in pairs(a.files, metric):
            if base is None:
                print(f"  new   {name}: no baseline")
                continue
            change, noise, verdict = judge(base, head, a.threshold)
            print(f"  {verdict:<12} {name} vs {ref}: {metric} median {change:+.1%} (noise {noise:.1%}, n={len(base)}/{len(head)})")
            worst = max(worst, {"ok": 0, "inconclusive": 2, "regression": 3}[verdict])
    except InputError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    if worst == 3:
        print(f"regression above {a.threshold:.0%} in {metric}")
        return 1
    if worst == 2:
        print(f"inconclusive: noise too large to judge a {a.threshold:.0%} change in {metric}; reduce noise or use a counter metric")
        return 2
    print(f"no regression above {a.threshold:.0%} in {metric}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
