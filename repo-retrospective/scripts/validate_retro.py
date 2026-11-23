#!/usr/bin/env python3
"""Check a retrospective data directory against the repo-retrospective/v1 contract (references/data-contract.md).

usage: validate_retro.py DIR        exit 0 valid, 1 violations (each printed), 2 unreadable

Frontends read only DIR/manifest.json and the files it names, so everything they may rely on is checked here.
"""
import json
import os
import re
import sys

CONTRACT = "repo-retrospective/v1"
TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
TYPES = {"time", "date", "int", "number", "string", "bool", "commit", "enum"}
PROVENANCE = {"recorded", "remeasured", "derived", "hand-picked", "mixed"}
ROW_PROVENANCE = {"recorded", "remeasured", "derived", "hand-picked"}
REQUIRED_DATASETS = {"milestones": {"time", "commit", "label", "detail"}}


def check_value(v, col):
    t = col["type"]
    if v is None:
        return col.get("nullable", False)
    if t == "time":
        return isinstance(v, str) and bool(TIME.match(v))
    if t == "date":
        return isinstance(v, str) and bool(DATE.match(v))
    if t == "int":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    if t == "string":
        return isinstance(v, str)
    if t == "bool":
        return isinstance(v, bool)
    if t == "commit":
        return isinstance(v, str) and bool(COMMIT.match(v))
    if t == "enum":
        return v in col.get("values", [])
    return False


def validate(d):
    errs = []
    try:
        m = json.load(open(os.path.join(d, "manifest.json")))
    except (OSError, ValueError) as e:
        print(f"manifest.json: {e}")
        sys.exit(2)
    if m.get("contract") != CONTRACT:
        errs.append(f"manifest: contract must be {CONTRACT!r}, is {m.get('contract')!r}")
    for k in ("repo", "head", "generated_at", "generator", "datasets"):
        if k not in m:
            errs.append(f"manifest: missing {k}")
    if "generated_at" in m and not TIME.match(str(m["generated_at"])):
        errs.append("manifest: generated_at must be UTC like 2026-01-01T00:00:00Z")
    ds = m.get("datasets", {})
    for name, cols in REQUIRED_DATASETS.items():
        if name not in ds:
            errs.append(f"manifest: dataset {name!r} is required")
        elif not cols <= set(ds[name].get("columns", {})):
            errs.append(f"{name}: needs columns {sorted(cols)}")
    for name, spec in ds.items():
        where = f"{name}"
        for k in ("file", "grain", "provenance", "columns"):
            if k not in spec:
                errs.append(f"{where}: missing {k}")
        cols = spec.get("columns", {})
        for c, col in cols.items():
            if col.get("type") not in TYPES:
                errs.append(f"{where}.{c}: type must be one of {sorted(TYPES)}")
            if col.get("type") == "enum" and not col.get("values"):
                errs.append(f"{where}.{c}: enum needs values")
        prov = spec.get("provenance")
        if prov not in PROVENANCE:
            errs.append(f"{where}: provenance must be one of {sorted(PROVENANCE)}")
        if prov == "mixed":
            pc = cols.get("provenance")
            if not pc or pc.get("type") != "enum" or not set(pc.get("values", [])) <= ROW_PROVENANCE:
                errs.append(f"{where}: provenance 'mixed' needs a row column 'provenance' (enum of {sorted(ROW_PROVENANCE)})")
        try:
            rows = json.load(open(os.path.join(d, spec.get("file", ""))))
        except (OSError, ValueError) as e:
            errs.append(f"{where}: cannot read {spec.get('file')}: {e}")
            continue
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            errs.append(f"{where}: must be a JSON array of objects")
            continue
        order = next((c for c in ("time", "date") if c in cols), None)
        prev = None
        for i, r in enumerate(rows):
            extra = set(r) - set(cols)
            if extra:
                errs.append(f"{where}[{i}]: undeclared columns {sorted(extra)}")
            for c, col in cols.items():
                if c not in r:
                    errs.append(f"{where}[{i}]: missing {c}")
                elif not check_value(r[c], col):
                    errs.append(f"{where}[{i}].{c}: {r[c]!r} is not a valid {col.get('type')}")
            if order and isinstance(r.get(order), str):
                if prev is not None and r[order] < prev:
                    errs.append(f"{where}[{i}]: rows must be sorted by {order} ({r[order]} after {prev})")
                prev = r[order]
            if len(errs) > 50:
                break
    return errs


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    errs = validate(sys.argv[1])
    for e in errs[:50]:
        print(e)
    if errs:
        print(f"{len(errs)} violation(s)" + (" (first 50 shown)" if len(errs) > 50 else ""))
        sys.exit(1)
    print("ok")


if __name__ == "__main__":
    main()
