#!/usr/bin/env python3
"""Reproduce the B1 gap table in ../../references/jev-questions.md.

Paragraphs from three sources were pooled, shuffled, stripped of any source
label, and scored per paragraph on `document_updating` (0-2) by a judge that
had seen neither the sources nor any article about them. `judge-key.json` holds
the unblinding; `judge-scores.json` holds what came back.

    python3 aggregate.py

Expected output (this is the measurement quoted in jev-questions.md B1):

    human          n=35  mean 0.09   gap  --
    AI, laundered  n=10  mean 0.30   gap +0.21   <- narrow band
    AI, unedited   n=13  mean 0.62   gap +0.53
"""
from __future__ import annotations

import json
import statistics as st
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
LABELS = {"HUMAN": "human", "AI_LAUNDERED": "AI, laundered", "AI_UNEDITED": "AI, unedited"}
ORDER = ["HUMAN", "AI_LAUNDERED", "AI_UNEDITED"]


def main() -> None:
    key = {k["id"]: k for k in json.loads((HERE / "judge-key.json").read_text(encoding="utf-8"))}
    scores = json.loads((HERE / "judge-scores.json").read_text(encoding="utf-8"))

    missing = [s["id"] for s in scores if s["id"] not in key]
    if missing:
        raise SystemExit(f"scored ids absent from the key: {missing[:5]}")

    grouped: dict[str, list[dict]] = defaultdict(list)
    for s in scores:
        grouped[key[s["id"]]["src"]].append(s)

    human = st.mean(x["document_updating"] for x in grouped["HUMAN"])
    print(f"{'source':16s}{'n':>5}{'mean':>7}{'du>=1':>8}{'du=2':>7}{'del-ok':>8}{'gap':>8}")
    for src in ORDER:
        v = grouped[src]
        n = len(v)
        mean = st.mean(x["document_updating"] for x in v)
        ge1 = 100 * sum(1 for x in v if x["document_updating"] >= 1) / n
        eq2 = 100 * sum(1 for x in v if x["document_updating"] == 2) / n
        dl = 100 * sum(1 for x in v if x["survives_deletion"]) / n
        gap = "--" if src == "HUMAN" else f"{mean - human:+.2f}"
        print(f"{LABELS[src]:16s}{n:5d}{mean:7.2f}{ge1:7.0f}%{eq2:6.0f}%{dl:7.0f}%{gap:>8}")

    laundered = st.mean(x["document_updating"] for x in grouped["AI_LAUNDERED"])
    band = "narrow -- rewrite the question" if laundered - human <= 0.3 else "wide -- usable"
    print(f"\nlaundered gap {laundered - human:+.2f} -> {band}")
    print("(Layer A scores this same laundered text at 0 removable tells, better")
    print(" than 5 of the 18 human articles. That contrast is the point.)")

    zeros = [s for s in grouped["AI_LAUNDERED"] if s["document_updating"] == 0]
    print(f"\n{len(zeros)}/{len(grouped['AI_LAUNDERED'])} laundered paragraphs scored 0 -- the "
          f"question cannot see generic-but-correct filler:")
    for s in zeros[:4]:
        print(f"  {s['id']}: {s.get('why', '(no reason recorded)')}")


if __name__ == "__main__":
    main()
