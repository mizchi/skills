---
name: ai-index
description: Method and tooling for measuring how AI-generated a piece of prose reads, in Japanese or English. Two layers — a deterministic lint for removable surface tells (scripts/slopscore.py, no API) and a judgment layer of typed probabilistic questions (Jev noul/score) for the tells that survive editing. Includes measured human/AI baselines, a gap-first calibration procedure, and labeled fixtures. Use when building or calibrating an AI-likeness score, or when a draft needs a defensible number rather than a vibe. For writing guidance use natural-writing-ja / natural-writing-en instead.
---

# AI Index

A measurement skill: given a text, produce a defensible number for "how AI does
this read", and know what that number is worth.

The short version of what the measurements below establish: **surface tells are
cheap to detect and cheap to remove, so they cannot carry the score.** A text
with zero surface tells has had its fingerprints wiped, which is not the same as
having something to say. The number that matters comes from the judgment layer.

## When to use

- Designing or calibrating an AI-likeness score for drafts, submissions, or CI
- Checking a draft before publishing, where "feels AI" needs to become a location and a reason
- Auditing a detector someone else built (the gap check in §4 is the audit)

Not for: deciding whether a *person* used AI. The measurements here separate
unedited model output from human prose. They do not separate a human from a
human who edited model output, and §3 shows exactly why.

## 1. The two layers

| | Layer A — surface | Layer B — judgment |
| --- | --- | --- |
| What it finds | word and shape tells (`することができます`, `delve`, uniform sentence length) | whether sentences carry information |
| Cost | free, deterministic, no API | one API call per document |
| Gap vs unedited AI | **wide** (measured: 0–1 vs 7–8 tells) | wide |
| Gap vs *edited* AI | **zero** (measured: §3) | holds |
| Removable by find-and-replace | yes, entirely | no |
| Use it as | a lint with a floor | the index |

Layer A is a spell-checker for slop. It is worth running because it is free and
because unedited output really does fail it. It is not a score, and §3 is the
reason.

## 2. Layer A — run the lint

```bash
python3 scripts/slopscore.py draft.md              # markdown or html; code blocks excluded
python3 scripts/slopscore.py --lang ja draft.md    # force language
python3 scripts/slopscore.py --json draft.md       # machine-readable
python3 scripts/slopscore.py --baseline corpus/*   # percentiles over a corpus
```

Exit code is 1 at or above the floor (3 tells over budget), so it drops into a
pre-commit hook or CI step unchanged. Stdlib only, no dependencies.

It reports per-signal hit rates against a budget, plus structural measures
(burstiness, register purity, lexical diversity) and the tell count. Signals and
thresholds live in `EN_RULES` / `JA_RULES` near the top of the script — edit
them there, then re-run §4 before trusting the new numbers.

Scope of what it reads: prose paragraphs and bullets. Code blocks, headings and
**table cells** are excluded — tables are lookup material, and counting them
makes any document that tabulates the patterns fail on its own examples.

**Measured baselines** (18 mizchi Zenn articles, one human English article, two
synthetic AI fixtures; full table in `references/calibration.md`):

| | human JA (n=18) | human EN (n=1) | AI unedited |
| --- | --- | --- | --- |
| tells over budget | 0–1 | 0 | 7–8 |
| burstiness CV | 0.36–0.66 | 0.62 | 0.24 (en) / 0.32 (ja) |
| register purity (JA) | 86–100% | — | 100% |
| MATTR(100) | 0.72–0.86 | 0.80 | 0.84 |

## 3. Why Layer A cannot be the score

`fixtures/ai_ja_laundered.md` is `fixtures/ai_ja.md` with **only** the lint's own
complaints fixed: phrases substituted, progress narration deleted. No argument
was added, no example, no number, no judgment.

```
ai_ja.md              CV 0.32   7 tells      <- unedited
ai_ja_laundered.md    CV 0.38   0 tells      <- same content, laundered
jev-is-gpu-for-llms   CV 0.57   1 tell       <- genuine human article
```

The laundered text scores **better than a real human article** on every Layer A
signal. It is still empty. Reproduce it:

```bash
python3 scripts/slopscore.py --baseline fixtures/*.md
```

Two consequences, and they are the whole reason this skill has a Layer B:

1. **Never report a Layer A pass as an AI-likeness verdict.** Report it as
   "no removable tells found", which is all it means.
2. **Never tune a draft against Layer A alone.** Optimising the lint produces
   laundered prose, which is the failure mode the lint was supposed to prevent.

## 4. Gap-first calibration (do this before tuning any threshold)

Adapted from the Jev field notes (`docs/practice.md` §4.0 in
[mizchi/jev-playground](https://github.com/mizchi/jev-playground)), which is the
single most useful rule here: **look at the gap before you touch the threshold.**

Sort the labeled corpus by the signal. Measure the margin between the worst
human and the best AI.

| margin | meaning | what to do |
| --- | --- | --- |
| wide | the signal works | leave the threshold alone, anywhere in the gap is fine |
| narrow / overlapping | the signal is wrong | **rewrite the question. Do not tune the threshold.** |

Tuning a threshold across a narrow gap buys nothing and costs a false-positive
rate you will not notice until it fires on someone's real writing.

Worked example — Japanese structural signals, from `references/calibration.md`:

| signal | human range | AI | margin | verdict |
| --- | --- | --- | --- | --- |
| tells over budget | 0–1 | 7 | **+6** | wide; usable |
| burstiness CV | 0.36–0.66 | 0.32 | +0.04 | narrow; **advisory only** |
| 体言止め per 10k | 0.0–8.8 | 0.0 | 0.00 | human floor is zero; unusable as a gate |
| 反問 per 10k | 0.0–20.2 | 0.0 | 0.00 | human floor is zero; unusable as a gate |

So Japanese burstiness is reported but never counted as a tell — the script
hard-codes that asymmetry, because English CV has a wide gap (0.62 vs 0.24) and
Japanese does not. And 体言止め / 反問, which are genuinely characteristic of
good Japanese technical prose, still cannot gate anything: 3 of 18 human
articles have neither. **A device being a positive signal when present does not
make its absence evidence.** That asymmetry is the most common design error in
homemade detectors.

Corollaries worth keeping:

- **Per-signal thresholds, never one global cutoff.** Signals differ in scale by
  an order of magnitude. One shared cutoff loses roughly half the true positives.
- **Confidence routes, it does not gate.** Report everything over threshold;
  send low-confidence items to a human with a different message. Gating on
  confidence throws away correct detections.
- **Do not average signals.** One signal carrying real information gets diluted
  by the silent ones. Take the max, or the excess over each signal's own threshold.
- **Always keep one broad question next to the atomic ones.** Atomic signals win
  on the failure classes you enumerated and lose on the ones you did not.

## 5. Layer B — the judgment layer

Layer B asks questions whose answers cannot be find-and-replaced, because
answering them requires the text to contain information. The full question set,
with the typed schema and the thresholds, is in `references/jev-questions.md`.

The load-bearing question, and the sharpest thing in any of the sources surveyed:

> **Does this sentence update the situation, or update the document?**

Sentences that update the *situation* report an event, a number, a measurement,
or the writer's actual judgment state. Sentences that update the *document*
report how the document looks or what it will do next — `本章では〜を扱う`,
"In this section we will explore", "It's important to note that". The second
kind carries no information about the subject, survives deletion with no loss,
and is what AI prose is overwhelmingly made of. Credit:
[k16shikano's cognitive-rhythm-writing norm](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432),
analysed in `natural-writing-ja`.

This is a good Jev question because it is **checkable from the subject alone** —
the gate can see the sentence, so it can answer. Compare a bad one: "would a
human have written this?" is not answerable from the text, and asking it returns
a confident number that means nothing.

Answer shapes follow the Jev typing rules:

- **`score`** for anything ordered — density of document-updating sentences,
  hedging level, specificity. Asking an ordered conclusion as a `choice` throws
  the ordering away; the Jev notes measure that mistake at 14/24 versus 23/24.
- **`noul`** for independent predicates — "this paragraph makes a claim with no
  name, number, or link attached". One threshold each.
- **`choice`** only for genuinely exclusive branches, and never with a
  "none of the above" option; put the escape hatch in a separate `noul`, because
  a `choice` always picks something and returns 0.96 confidence on nonsense.

Pack every question into one request. The Jev measurements put 20 questions in
one call at 246 ms against 5227 ms split across 20 calls, with answers moving by
0.011 — so there is no reason to ask fewer questions, only fewer times.

Without a Jev key, run the same question set through any capable model as a
rubric, with two rules: **ask for locations, not a score** (line number + quote +
which test failed), and **dispatch a fresh reviewer each round**, since a
reviewer that has seen its own previous notes stops finding new ones.

## 6. Reporting

Report three numbers, never one:

```
removable tells:    0 / 8 signals over budget      (Layer A — means fingerprints, not substance)
document-updating:  0.21 of sentences              (Layer B — the index)
unsupported claims: 2 locations                    (Layer B — with line numbers)
```

Collapsing these into a single percentage is the thing to avoid. The layers have
different adversary models, and a reader who sees one number will assume it is
the strong one.

## Pitfalls

- **Treating a Layer A pass as clean.** §3. This is the failure this skill exists to prevent.
- **Tuning thresholds across a narrow gap.** §4. Rewrite the question instead.
- **Reading absence of a human device as evidence of AI.** 3 of 18 human articles have no 体言止め and no 反問.
- **Scoring MATTR / type-token ratio.** Measured *higher* for the AI fixture (0.84) than for human prose (0.80): a human technical writer repeats `commit count` deliberately where a model reaches for variety. Report it, do not score it. Plain TTR is worse — it is length-dependent (0.42 vs MATTR 0.80 on the same text) and unusable across documents of different lengths.
- **Trusting the em-dash.** Both human and AI fixtures measured 0.0 per 1000 words here. It catches one specific lazy default and is cited far past its evidence.
- **Counting tricolons by shape.** A published threshold of <1 per 200 words flags the human reference article at 1.55. Of its 14 hits, 12 are real domain enumerations (`LOC, commit count and PR count`), 1 is not a triple at all (a comma splice the regex mis-parsed), and exactly 1 is the abstract kind the signal is about — a 93% false-positive rate. Only abstract triples are a tell, which is a judgment question, not a regex.
- **Letting code into the corpus.** Code blocks wreck every length and diversity measure. `slopscore.py` strips them; a hand-rolled script usually does not.
- **Scoring a document that quotes the patterns.** A style guide tabulating `utilize / leverage / facilitate` trips its own detector on every row. `slopscore.py` excludes table cells for this reason (bullets and prose still count), which took `natural-writing-en/SKILL.md` from 5 tells to 2. Any text that discusses tells rather than committing them needs the same exemption, and the residue is expected — read the locations rather than the count.
- **Calibrating on one AI sample.** The fixtures here are two synthetic documents. They establish that the gap exists, not its width. Add your own labeled examples before shipping a gate.

## Files

| path | contents |
| --- | --- |
| `scripts/slopscore.py` | Layer A lint, JA + EN, stdlib only |
| `references/calibration.md` | measured baselines, per-signal gap table, recalibration procedure |
| `references/jev-questions.md` | Layer B question set, typed schema, thresholds |
| `fixtures/ai_ja.md` | unedited AI Japanese |
| `fixtures/ai_ja_laundered.md` | same text with only Layer A fixed — the §3 counterexample |
| `fixtures/ai_en.md` | unedited AI English |

## Related

- `natural-writing-ja` / `natural-writing-en` — the generation side: how to write so this measures low
- `mizchi-blog-style` — a voice-specific metric built on the same two-layer split
- `empirical-prompt-tuning` — the iterate-and-re-evaluate loop this calibration procedure plugs into
