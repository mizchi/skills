#!/usr/bin/env python3
"""Compare Layer B question wordings on the same blinded paragraph set.

The point of this script is the gap column. B1 (`document_updating`) was
measured at +0.21 against laundered AI output, which this skill's own gap-first
rule calls narrow, so the question needed replacing rather than re-thresholding.
The JevSlop axes are the candidate replacements; this scores them on the same 58
source-blinded paragraphs so the comparison is like for like.

    python3 compare-axes.py

Files:
    judge-key.json          the unblinding (paragraph id -> source)
    judge-scores.json       B1 document_updating, 0-2
    judge-scores-jevslop.json   genericness / specificity / personalEvidence, 0-4
"""
from __future__ import annotations

import json
import statistics as st
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
ORDER = ["HUMAN", "AI_LAUNDERED", "AI_UNEDITED"]
LABEL = {"HUMAN": "human", "AI_LAUNDERED": "laundered", "AI_UNEDITED": "unedited"}

# axis -> (max level, higher value means more AI-slop-like)
AXES = {
    "document_updating": (2, True),
    "genericness": (4, True),
    "specificity": (4, False),
    "personalEvidence": (4, False),
}


def load(name: str) -> list[dict]:
    p = HERE / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def main() -> None:
    key = {k["id"]: k["src"] for k in load("judge-key.json")}
    rows: dict[str, dict] = defaultdict(dict)
    for s in load("judge-scores.json"):
        rows[s["id"]]["document_updating"] = s["document_updating"]
    for s in load("judge-scores-jevslop.json"):
        for a in ("genericness", "specificity", "personalEvidence"):
            if a in s:
                rows[s["id"]][a] = s[a]
    if not rows:
        raise SystemExit("no scores found next to this script")

    print(f"{'axis':20s}{'scale':>7}{'human':>8}{'laundered':>11}{'unedited':>10}"
          f"{'gap':>7}{'gap/pt':>8}  verdict")
    print("-" * 88)
    for axis, (top, higher_is_slop) in AXES.items():
        by = defaultdict(list)
        for pid, vals in rows.items():
            if axis in vals and pid in key:
                by[key[pid]].append(vals[axis])
        if not all(by.get(s) for s in ORDER):
            print(f"{axis:20s}{'0-' + str(top):>7}{'(not scored)':>29}")
            continue
        m = {s: st.mean(by[s]) for s in ORDER}
        sign = 1 if higher_is_slop else -1
        raw = sign * (m["AI_LAUNDERED"] - m["HUMAN"])       # in the axis's own points
        per = raw / top                                      # share of full range
        # The 0.2-0.3 narrow band comes from the Jev field notes on a 0-2 score,
        # so it is a RAW-points band. Compare it only against raw on that scale;
        # for axes with a different range, judge on gap/pt.
        if per <= 0:
            verdict = "no separation / inverted"
        elif per <= 0.15:
            verdict = "narrow - rewrite"
        else:
            verdict = "WIDE - usable"
        print(f"{axis:20s}{'0-' + str(top):>7}{m['HUMAN']:8.2f}{m['AI_LAUNDERED']:11.2f}"
              f"{m['AI_UNEDITED']:10.2f}{raw:+7.2f}{per:+8.2f}  {verdict}")

    print("\n`gap` is laundered minus human in the axis's own points, signed so that")
    print("positive means the axis puts AI output further from human prose. `gap/pt`")
    print("divides by the axis range, which is what makes a 0-2 and a 0-4 axis")
    print("comparable. The Jev field notes' narrow band (0.2-0.3) is stated in raw")
    print("points on a 0-2 score, i.e. 0.10-0.15 of range, so the verdict column")
    print("thresholds gap/pt at 0.15 rather than applying a raw band across scales.")
    print("\nLayer A on the same laundered text: 0 removable tells, better than 5")
    print("of the 18 human articles. Any axis that cannot beat that is not an index.")


if __name__ == "__main__":
    main()
