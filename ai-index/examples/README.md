# Worked example

One article measured end to end with these skills, kept with the evidence
because several numbers in `../SKILL.md`, `../references/` and
`../../natural-writing-ja/SKILL.md` cite this run and would otherwise be
unreproducible assertions.

| path | what it is |
| --- | --- |
| `zenn-ai-index-article.md` | the article, Zenn frontmatter, `published: true` |
| `judgment-layer/` | the blinded Layer B measurements; `aggregate.py` for B1, `compare-axes.py` to compare question wordings |
| `reader-runs/run-01`, `run-02` | two `first-reader` beta-read runs, before and after revision |
| `rehydrate.py` | puts the passages back into the sessions so `room.py` can rebuild the pages |

## The article

Written with `natural-writing-ja` and `mizchi-blog-style`, scored with
`../scripts/slopscore.py`, then beta-read twice with the `first-reader` skill.
It is also the subject of its own measurements, which is why it keeps tripping
its own lint — it quotes the patterns it warns about.

```bash
python3 ../scripts/slopscore.py --lang ja zenn-ai-index-article.md
```

Final state: 2 removable tells (both quotations, floor is 3), and all five
discourse-shape measures inside the corpus band — 1.50 sentences per paragraph,
55% one-sentence paragraphs, no paragraph of 5+ sentences, a 1-sentence opening,
86% noun-label headings.

## The Layer B measurement

```bash
cd judgment-layer && python3 aggregate.py
```

Reproduces the gap table quoted in `../references/jev-questions.md` under B1:
human 0.09, laundered 0.30 (+0.21), unedited 0.62 (+0.53). The +0.21 lands in
the *narrow* band of this skill's own gap-first rule, so the measurement
undercuts the question it was meant to validate. `judge-key.json` is the
unblinding; the judge saw only shuffled, unlabeled paragraphs.

## The reader runs

`log.jsonl` is the evidence: one line per passage, with the reader's felt
reaction (`needle`, -2..+2), what they expected, what they got, and where they
started skimming. Nothing else in these directories is load-bearing.

What changed between the runs, in reader behaviour:

| | run-01 | run-02 |
| --- | --- | --- |
| skeptic, mean needle | +1.00 | **+1.75** |
| skeptic, lowest | −1 (passage 6, 「急に宣伝の気配」) | **+1** |
| skeptic, negative passages | 1 | **0** |
| sympathetic, mean needle | +1.50 | +1.33 |
| quits | none | none |

Neither reader quit in either run, including a skeptic cast with a two-line
patience budget. The revision closed the skeptic's trough and opened a shallow
one for the sympathetic reader at the same passage, for the same reason stated
from the other side: the tool's name arrives before the line saying it is not
required.

`state.json` ships with `chunks: null`, because `feed.py` stores the whole draft
inside every session and four copies of the article is not evidence. Run
`rehydrate.py` before `room.py` and do not commit the result.

Only run-02 rehydrates. Run-01 read a shorter draft, and splitting the
committed article into its 10 passages would succeed while being wrong — the
rebuilt page would print run-01's notes beside text those readers never saw, so
`rehydrate.py` refuses it. Run-01's logs stand on their own.

```bash
python3 rehydrate.py
python3 ~/.claude/skills/first-reader/scripts/room.py reader-runs/run-02 \
    --out /tmp/room.html --annotations reader-runs/run-02/room-annotations.json
```

## What this example is for

Three claims in the skills rest on it, and all three are cases of a measurement
contradicting the thing it was built to support:

1. **A surface lint cannot be an AI score.** The laundered fixture scores 0
   tells against a human article's 1, with no content added (`../SKILL.md` §3).
2. **B1's gap is narrow.** 8 of 10 laundered paragraphs scored 0 because a
   sentence stating a mechanism reads as subject-updating even when the
   mechanism is generic (`../references/jev-questions.md`).
3. **Numbers are read by their unit, not their count.** Both readers, in both
   runs, read the table measured in sentences and paragraphs and skipped the
   fractions whose denominators were never named
   (`../../natural-writing-ja/SKILL.md`).
