#!/usr/bin/env python3
"""List the commits where a repository's direction probably changed, as candidates for a milestone timeline.

usage: decision_points.py [-C REPO] [--rev HEAD] [--since DATE] [--format md|json|tsv] [--min-weight 2]

It proposes; it does not pick. Expect roughly 5-10x more candidates than milestones worth keeping.
Signals (kind, weight):
  rename        3  5+ files moved from one directory to another, or a subject starting with "Rename"
  new-package   3  a new package manifest (Cargo.toml, package.json, go.mod, ...) outside tests/fixtures/vendor
  removed-area  3  the last file under a top-level directory or package goes away
  gate          3  a new CI workflow, or a new list a check compares against (baseline, ratchet, golden, snapshot)
  new-module    2  a new source file of 150+ lines outside tests (a component written in one go)
  new-area      2  the first file under a new top-level directory or package
  new-scope     2  a one-word subject prefix ("lsp:", "zurgo:") seen for the first time (after the first 20
                   commits) and used 3+ times in all
  milestone     2  the first use of each milestone word in a subject: fixed point, self-host, bootstrap, MVP,
                   M0, v0/v1, end to end
  measure       2  a new metrics / KPI / benchmark log (kpi*.tsv, metrics*.csv, bench*.json, ...)
  adr           2  a new ADR / RFC / decision / design document
  pr-series     2  the first merged PR of a branch family with 2+ merged PRs (feature-1, feature-2, ...)
  session       2  the first commit of an agent session (a Claude-Session trailer not seen before)
  pace          2  the hour where the next 6 hours average 2x+ the commits per hour of the previous 24
  report        1  a new dated report / work-log document (not a move)
  verb          1  split / extract / replace / remove / migrate / switch to / rewrite / introduce in the subject
Times are author times in UTC. Commits by *[bot] authors and merge commits are skipped (merges only feed pr-series).
"""
import argparse
import collections
import datetime as dt
import json
import re
import subprocess
import sys

MONOREPO_ROOTS = ("crates", "packages", "apps", "libs", "services", "modules", "plugins", "cmd", "internal", "src")
NOT_PRODUCT = re.compile(r"(^|/)(tests?|spec|__tests__|fixtures?|vendor|third_party|node_modules|examples?|testdata|out|dist|target)(/|$)", re.I)
MANIFEST = re.compile(r"(^|/)(Cargo\.toml|package\.json|go\.mod|pyproject\.toml|setup\.py|moon\.mod\.json|deno\.jsonc?|pom\.xml|build\.gradle(\.kts)?|mix\.exs|gleam\.toml)$")
GATE = re.compile(r"(^\.github/workflows/[^/]+\.ya?ml$)|((^|/)[^/]*(baseline|ratchet|golden|snapshot|allowlist|passing)[^/]*\.(txt|tsv|json|ya?ml)$)", re.I)
MEASURE = re.compile(r"(^|/)[^/]*(kpi|metric|bench|perf)[^/]*\.(tsv|csv|json|jsonl)$", re.I)
ADR = re.compile(r"(^|/)(adrs?|decisions|rfcs?|design)/[^/]+\.(md|mdx|rst|txt)$|(^|/)ADR[-_]?\d+[^/]*\.md$", re.I)
REPORT = re.compile(r"(^|/)(reports?|worklog|journal|notes)/[^/]+\.(md|mdx|txt)$", re.I)
CODE = re.compile(r"\.(rs|py|ts|tsx|js|mjs|go|mbt|ml|c|cc|cpp|h|java|kt|swift|rb|ex|exs|gleam|zig|hs|scala|cs|lua)$")
VERB = re.compile(r"\b(split|extract|replace|remove|drop|migrate|switch(ed)? to|rewrite|introduce|adopt|deprecate)\b", re.I)
MILESTONE = re.compile(r"\b(fixed[- ]point|self[- ]host(ed|ing)?|bootstrap(ped)?|mvp|m0|v0|v1(\.0)?|end[- ]to[- ]end|first (working|version|release))\b", re.I)
SCOPE = re.compile(r"^\s*([A-Za-z][\w./-]{0,23})(\([^)]*\))?!?:\s")
WEIGHT = {"rename": 3, "new-package": 3, "removed-area": 3, "gate": 3, "new-module": 2, "new-area": 2, "new-scope": 2,
          "milestone": 2, "measure": 2, "adr": 2, "pr-series": 2, "session": 2, "pace": 2, "report": 1, "verb": 1}


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip())
    return r.stdout


def utc(s):
    return dt.datetime.fromisoformat(s).astimezone(dt.timezone.utc)


def area(path):
    """The unit whose birth or death is a decision: a top-level dir, or a package dir under a monorepo root."""
    p = path.split("/")
    if len(p) > 2 and p[0] in MONOREPO_ROOTS:
        return "/".join(p[:2])
    return p[0] if len(p) > 1 else None


def expand_rename(spec):
    """'src/{a => b}/x.rs' or 'a.rs => b.rs' -> (old, new)"""
    m = re.match(r"(.*)\{(.*) => (.*)\}(.*)", spec)
    if m:
        pre, o, n, post = m.groups()
        return re.sub("//", "/", pre + o + post), re.sub("//", "/", pre + n + post)
    o, n = spec.split(" => ")
    return o, n


def commits(repo, rev, since):
    fmt = "%x1e%H%x1f%aI%x1f%an%x1f%(trailers:key=Claude-Session,valueonly,separator=;)%x1f%s"
    args = ["log", "--reverse", "--no-merges", "-M", "--numstat", "--summary", f"--format={fmt}", rev]
    if since:
        args.append(f"--since={since}")
    for rec in git(repo, *args).split("\x1e")[1:]:
        head, _, body = rec.partition("\n")
        h, d, a, sess, s = head.split("\x1f")
        added, created, deleted, renamed = {}, [], [], []
        for l in body.splitlines():
            parts = l.split("\t")
            if len(parts) == 3:
                path = parts[2]
                if " => " in path:
                    path = expand_rename(path)[1]
                added[path] = int(parts[0]) if parts[0].isdigit() else 0
                continue
            l = l.strip()
            if l.startswith("create mode"):
                created.append(l.split(" ", 3)[3])
            elif l.startswith("delete mode"):
                deleted.append(l.split(" ", 3)[3])
            elif l.startswith("rename "):
                renamed.append(expand_rename(re.sub(r" \(\d+%\)$", "", l[len("rename "):])))
        yield dict(h=h, t=utc(d), author=a, session=sess.strip().split(";")[0], subject=s,
                   added=added, created=created, deleted=deleted, renamed=renamed)


def scan(repo, rev, since):
    cs = [c for c in commits(repo, rev, since) if not c["author"].endswith("[bot]")]
    scope_count = collections.Counter(m.group(1).lower() for c in cs for m in [SCOPE.match(c["subject"])] if m)
    out, live = [], collections.Counter()
    seen_area, seen_sess, seen_scope, seen_word = set(), set(), set(), set()
    hours = collections.Counter()
    n = 0
    for c in cs:
        n += 1
        first = n == 1

        def add(kind, why):
            out.append(dict(kind=kind, weight=WEIGHT[kind], time=c["t"], commit=c["h"][:8], subject=c["subject"], why=why))

        hours[c["t"].replace(minute=0, second=0, microsecond=0)] += 1
        moves = collections.Counter()
        for old, new in c["renamed"]:
            if old.rsplit("/", 1)[0] != new.rsplit("/", 1)[0]:
                moves[(old.rsplit("/", 1)[0], new.rsplit("/", 1)[0])] += 1
            for p, d in ((old, -1), (new, +1)):
                if area(p):
                    live[area(p)] += d
        for p in c["created"]:
            a = area(p)
            if a and live[a] == 0 and a not in seen_area and not first and not NOT_PRODUCT.search(a + "/"):
                add("new-area", f"new area {a}/")
            if a:
                live[a] += 1
                seen_area.add(a)
            if first:
                continue
            if MANIFEST.search(p) and "/" in p and not NOT_PRODUCT.search(p):
                add("new-package", f"new manifest {p}")
            if GATE.search(p):
                add("gate", f"new check input {p}")
            if MEASURE.search(p):
                add("measure", f"new measurement log {p}")
            if ADR.search(p):
                add("adr", f"new decision document {p}")
            elif REPORT.search(p):
                add("report", f"new report {p}")
            if CODE.search(p) and not NOT_PRODUCT.search(p) and c["added"].get(p, 0) >= 150:
                add("new-module", f"new {p} ({c['added'][p]} lines)")
        for p in c["deleted"]:
            a = area(p)
            if a:
                live[a] -= 1
                if live[a] == 0:
                    add("removed-area", f"last file of {a}/ removed")
        big = [(o, nw, k) for (o, nw), k in moves.items() if k >= 5]
        if big:
            o, nw, k = max(big, key=lambda x: x[2])
            add("rename", f"{k} files moved {o}/ -> {nw}/")
        elif re.match(r"^\s*rename\b", c["subject"], re.I):
            add("rename", "subject starts with Rename")
        m = SCOPE.match(c["subject"])
        if m:
            scope = m.group(1).strip().lower()
            if scope not in seen_scope and n > 20 and scope_count[scope] >= 3:
                add("new-scope", f"first commit with subject prefix '{scope}:'")
            seen_scope.add(scope)
        for mw in MILESTONE.finditer(c["subject"]):
            key = re.sub(r"[- ]", "", mw.group(0).lower())
            key = {"selfhosted": "selfhost", "selfhosting": "selfhost", "bootstrapped": "bootstrap", "v1.0": "v1"}.get(key, key)
            if key not in seen_word:
                seen_word.add(key)
                add("milestone", f"first use of the milestone word '{mw.group(0)}'")
        if c["session"] and c["session"] not in seen_sess:
            seen_sess.add(c["session"])
            add("session", f"first commit of session …{c['session'][-8:]}")
        if VERB.search(c["subject"]) and not big:
            add("verb", f"verb '{VERB.search(c['subject']).group(0)}' in the subject")
    if hours:
        start, end = min(hours), max(hours)
        h, last = start + dt.timedelta(hours=24), None
        while h <= end:
            prev = sum(hours[h - dt.timedelta(hours=i)] for i in range(1, 25)) / 24
            nxt = sum(hours[h + dt.timedelta(hours=i)] for i in range(6)) / 6
            if nxt >= 2 * max(prev, 0.5) and nxt >= 3 and (last is None or h - last > dt.timedelta(hours=24)):
                out.append(dict(kind="pace", weight=WEIGHT["pace"], time=h, commit="", subject="",
                                why=f"{nxt:.1f} commits/h over the next 6h vs {prev:.1f} over the previous 24h"))
                last = h
            h += dt.timedelta(hours=1)
    fams = collections.defaultdict(list)  # family -> merges in order
    margs = ["log", "--reverse", "--merges", "--format=%H%x1f%aI%x1f%s", rev] + ([f"--since={since}"] if since else [])
    for l in git(repo, *margs).splitlines():
        h, d, s = l.split("\x1f")
        m = re.match(r"Merge pull request #(\d+) from [^/\s]+/(\S+)", s)
        if m:
            fams[re.sub(r"[-_]?\d+$", "", m.group(2).rsplit("/", 1)[-1])].append((h, utc(d), s, m.group(1)))
    for fam, merges in fams.items():
        if len(merges) >= 2:  # a series (feature-1, feature-2, ...), not one branch with a random name
            h, t, s, num = merges[0]
            out.append(dict(kind="pr-series", weight=WEIGHT["pr-series"], time=t, commit=h[:8], subject=s,
                            why=f"first of {len(merges)} merged PRs of branch family '{fam}' (#{num})"))
    return sorted(out, key=lambda r: r["time"])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("-C", dest="repo", default=".")
    ap.add_argument("--rev", default="HEAD")
    ap.add_argument("--since")
    ap.add_argument("--format", choices=("md", "json", "tsv"), default="md")
    ap.add_argument("--min-weight", type=int, default=2, help="drop commits whose summed weight is below this")
    a = ap.parse_args()
    merged, by = [], {}
    for r in scan(a.repo, a.rev, a.since):
        key = r["commit"] or f"pace@{r['time']}"
        if key in by:
            m = by[key]
            if r["kind"] not in m["kinds"]:
                m["kinds"].append(r["kind"])
                m["weight"] += r["weight"]
            m["why"].append(r["why"])
        else:
            m = by[key] = dict(time=r["time"].strftime("%Y-%m-%dT%H:%M:%SZ"), commit=r["commit"], weight=r["weight"],
                               kinds=[r["kind"]], subject=r["subject"], why=[r["why"]])
            merged.append(m)
    rows = [m for m in merged if m["weight"] >= a.min_weight]
    if a.format == "json":
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
        print()
    elif a.format == "tsv":
        print("time\tcommit\tweight\tkinds\tsubject\twhy")
        for m in rows:
            print("\t".join([m["time"], m["commit"], str(m["weight"]), ",".join(m["kinds"]), m["subject"], "; ".join(m["why"])]))
    else:
        print("| time (UTC) | commit | w | kinds | subject | why |\n|---|---|---:|---|---|---|")
        for m in rows:
            subj = m["subject"].replace("|", "\\|")[:90]
            print(f"| {m['time'][:16].replace('T', ' ')} | {m['commit']} | {m['weight']} | {', '.join(m['kinds'])} | {subj} | {'; '.join(m['why'][:3])} |")
    print(f"{len(rows)} candidates (of {len(merged)} commits with any signal, min weight {a.min_weight})", file=sys.stderr)


if __name__ == "__main__":
    main()
