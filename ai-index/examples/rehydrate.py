#!/usr/bin/env python3
"""Put the passages back into the committed reader sessions.

`feed.py` stores the draft inside every reader's `state.json`, so the four
sessions here would carry four copies of the article. They are committed with
`chunks` set to null; this re-splits the article the same way the feed did and
writes them back, after which `room.py` can rebuild the pages:

    python3 rehydrate.py
    python3 ~/.claude/skills/first-reader/scripts/room.py reader-runs/run-02 \
        --out /tmp/room.html --annotations reader-runs/run-02/room-annotations.json

Only run-02 is rehydrated. Run-01 read a shorter draft, and splitting the
committed article into its 10 passages would produce ten chunks of the *wrong*
text -- a rebuilt page would print run-01's notes beside passages those readers
never saw. Run-01's `log.jsonl` is the evidence and stands on its own.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
ARTICLE = HERE / "zenn-ai-index-article.md"


def passages(text: str, want: int) -> list[str] | None:
    """Split on blank lines the way feed.py does, then pack into `want` chunks."""
    body = text.split("---\n", 2)[-1]
    blocks = [b.strip() for b in body.split("\n\n") if b.strip()]
    if not blocks:
        return None
    per = max(1, round(len(blocks) / want))
    out, cur = [], []
    for b in blocks:
        cur.append(b)
        if len(cur) >= per and len(out) < want - 1:
            out.append("\n\n".join(cur))
            cur = []
    if cur:
        out.append("\n\n".join(cur))
    return out if len(out) == want else None


def main() -> int:
    if not ARTICLE.exists():
        print(f"missing {ARTICLE}", file=sys.stderr)
        return 1
    text = ARTICLE.read_text(encoding="utf-8")
    done = 0
    for state in sorted(HERE.glob("reader-runs/run-*/*/state.json")):
        run = state.parent.parent.name
        d = json.loads(state.read_text(encoding="utf-8"))
        if d.get("chunks"):
            continue
        if run != "run-02":
            # Splitting the current article to this run's passage count would
            # succeed and be wrong: the text would not be what these readers saw.
            print(f"skip {run}/{state.parent.name}: read an earlier draft, "
                  f"so its passages are not recoverable from the committed article")
            continue
        note = d.get("_chunks_note", "")
        want = int(note.split()[0]) if note[:1].isdigit() else 0
        ch = passages(text, want) if want else None
        if not ch:
            print(f"skip {run}/{state.parent.name}: wants {want} passages, "
                  f"the committed article does not split that way")
            continue
        d["chunks"] = ch
        d.pop("_chunks_note", None)
        state.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"rehydrated {state.parent.parent.name}/{state.parent.name} ({want} passages)")
        done += 1
    print(f"\n{done} session(s) rehydrated. Do not commit the result -- it re-adds "
          f"a copy of the article to each file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
