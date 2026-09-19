# Layer B — the judgment question set

Questions whose answers cannot be find-and-replaced, because answering them
requires the text to contain information. Typed for
[Jev](https://github.com/mizchi/jev-playground) (`POST /v1/systemone`), but the
wording works as a rubric for any capable model.

## Design rules applied

From the Jev field notes (`docs/practice.md`), each rule with the measurement
that justifies it:

| rule | why |
| --- | --- |
| ordered conclusions use `score`, never `choice` | `choice` discards the ordering: 14/24 → 23/24 on the same data |
| independent predicates use `noul`, one threshold each | per-question thresholds took 13/36 → 24/36 at equal false positives |
| never put "none of the above" in a `choice` | `choice` always picks; returns conf 0.96 on nonsense. Put the escape in a separate `noul` (18/18 vs 16/18) |
| ask only what is visible in the subject | a question needing invisible context returns a confident middle value — gap 0.28 → 0.77 after rewording |
| never write the threshold into the question | thresholds are a code decision; in the prompt they break comparability across recalibrations |
| one request, all questions | 20 questions: 246 ms vs 5227 ms split, answers moved 0.011 |
| atomic questions supplement a broad one | atomic wins on enumerated classes (25/36 vs 18/36), loses on unenumerated (11/15 vs 15/15) |
| do not average; take max or excess-over-threshold | averaging dilutes the one question carrying signal |
| confidence routes, never gates | gating on confidence cost 11 points (73.7% → 62.5%) |

The unit of judgment is the **paragraph**, not the document. Ask per paragraph
and aggregate in code — a document-level score cannot tell you where to edit,
and batching costs nothing.

## The questions

### B1 — document-updating density (`score`, the primary index)

The load-bearing question. Credit:
[k16shikano's cognitive-rhythm-writing norm](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432).

```json
{
  "document_updating": {
    "type": "score",
    "instructions": "This paragraph's sentences describe the document itself rather than its subject.",
    "criteria": [
      "Every sentence reports something about the subject: an event, a measurement, a number, a named thing, or the writer's own judgement (a belief held, a doubt, a concession, a regret).",
      "Mixed: some sentences report the subject, others only describe how the text is organised or what it will cover.",
      "Most sentences only describe the text itself: what this section covers, what was covered above, what comes next, how the explanation should be read."
    ]
  }
}
```

Visible in the subject: yes — the paragraph is right there.
Aggregate as **mean over paragraphs** (this one is a density, so the mean is the
quantity of interest), and separately flag any paragraph at 2.

**Measured gap, and it is narrower than this question's billing.** Paragraphs
from `fixtures/ai_ja_laundered.md`, `fixtures/ai_ja.md` and one human article
were pooled, source-blinded, shuffled and scored per paragraph by a judge that
had seen neither the sources nor any article about them (58 paragraphs):

| source | n | mean | du>=1 | du=2 | survives deletion |
| --- | --- | --- | --- | --- | --- |
| human | 35 | **0.09** | 6% | 3% | 3% |
| AI, laundered | 10 | **0.30** | 20% | 10% | 20% |
| AI, unedited | 13 | **0.62** | 38% | 23% | 31% |

The ordering is right, and it catches what Layer A cannot: the laundered text
scores 0 removable tells yet 0.30 here against a human 0.09. But the gap against
laundered output is **+0.21**, which §4's own table puts in the *narrow* band —
so by this skill's own rule the question needs rewriting, not a threshold.

Reading the per-paragraph scores says why: 8 of the 10 laundered paragraphs
scored 0, with reasons like 「型チェック無効化と絞り込み強制の機構」. **A sentence
stating a mechanism reads as subject-updating even when the mechanism is generic.**
B1 asks only whether the text talks about itself, so it cannot separate a correct
generality from this document's actual situation — and generic-but-correct filler
is exactly what laundering leaves behind.

Candidate rewrite, unmeasured: "この段落の内容は、この文書が扱っている特定の事例
からしか出てこないか" — i.e. ask for *non-portability* rather than
self-reference. B5 already gestures at this; the two may need merging. Do not
trust either wording until it is re-measured on a blinded set.

### B2 — deletion test (`noul`, per paragraph)

```json
{
  "survives_deletion": {
    "type": "noul",
    "instructions": "Deleting this paragraph would remove no fact, number, name, cause, or trade-off from the document.",
    "criteria": {
      "true": "The paragraph restates, frames, or generalises. A reader could not name one specific thing learned from it.",
      "false": "The paragraph carries at least one concrete item: a name, a number, a date, a mechanism, a measurement, or a stated trade-off."
    }
  }
}
```

### B3 — unsupported authority (`noul`, per paragraph)

```json
{
  "unsupported_claim": {
    "type": "noul",
    "instructions": "This paragraph asserts that something is known, shown, or agreed without attaching a name, number, link, or first-hand observation.",
    "criteria": {
      "true": "Appeals to studies, experts, common knowledge, or general practice with nothing a reader could check.",
      "false": "Either attaches a checkable source, or is stated openly as the writer's own view."
    }
  }
}
```

Report every hit with its location. This is the one signal whose output is a
list, not a number.

### B4 — abstract triple (`noul`, per paragraph)

The regex replacement for the tricolon signal, which false-positives on real
enumerations (see `calibration.md` finding 3).

```json
{
  "abstract_triple": {
    "type": "noul",
    "instructions": "This paragraph contains a three-item list whose items are abstract qualities rather than specific things.",
    "criteria": {
      "true": "Three balanced abstractions, e.g. 'verification, systems thinking, and accountability'.",
      "false": "No triple, or a triple of concrete referents, e.g. 'LOC, commit count and PR count'."
    }
  }
}
```

### B5 — subject-side material (`score`, per paragraph)

Catches the laundered case specifically: fingerprints removed, nothing added.

```json
{
  "subject_material": {
    "type": "score",
    "instructions": "How much of this paragraph comes from the subject rather than from general knowledge about the topic?",
    "criteria": [
      "Nothing specific: could have been written about any tool in this category, by someone who had not used this one.",
      "Some specifics, but they are the ones anyone would know from the documentation.",
      "Carries first-hand material: what was run, what it returned, what broke, what the writer decided and why."
    ]
  }
}
```

### B6 — broad backstop (`score`, whole document)

Required by the atomic-plus-broad rule: B1–B5 only catch the failure classes
that were enumerated.

```json
{
  "reads_generated": {
    "type": "score",
    "instructions": "This text reads as though it was assembled from general knowledge about the topic rather than written by someone reporting what they did.",
    "criteria": [
      "Reads as first-hand: a specific person, specific work, specific results.",
      "Mixed, or hard to tell.",
      "Reads as assembled: correct, fluent, and attached to no particular occasion."
    ]
  }
}
```

Take the conservative side of B6 and the B1–B5 aggregate — do not average them.

## Thresholds

Starting points only. Fit them on your own corpus per `calibration.md`, and read
the gap before touching any of them.

| question | shape | start | aggregate |
| --- | --- | --- | --- |
| B1 document_updating | score 0–2 | > 0.8 | mean over paragraphs |
| B2 survives_deletion | noul | > 0.6 | count + locations |
| B3 unsupported_claim | noul | > 0.5 | count + locations |
| B4 abstract_triple | noul | > 0.7 | count |
| B5 subject_material | score 0–2 | < 1.0 flags | min over paragraphs |
| B6 reads_generated | score 0–2 | > 1.2 | single value |

Different thresholds per question is the point, not an inconvenience — the same
eight-question set measured self-class answers from 0.20 to 0.94, so one shared
cutoff loses about half the true positives.

## The index

```
ai_index = max over questions of  (score - threshold) / (max_score - threshold)
```

Clamped to [0, 1]; negative contributions are dropped. Max, not mean, because a
single question carrying real signal must not be diluted by the silent ones.

Report it next to the Layer A count and the B3 location list, never collapsed
into one number:

```
removable tells:      0 / 8 over budget       (surface; means fingerprints, not substance)
ai index:             0.58                     (driven by: B1 document_updating 1.4)
unsupported claims:   2   L34, L71
```

## Without an API key

Run B1–B6 as a rubric against any capable model, with three rules:

1. **Ask for locations, not a score.** Line number + quote + which test failed.
   A returned number you cannot act on is worse than no number.
2. **Dispatch a fresh reviewer each round.** A reviewer that has seen its own
   earlier notes stops finding new problems.
3. **Stop at "good enough".** Convergence is two consecutive rounds where the
   remaining findings are matters of taste. Chasing zero produces parody.

`empirical-prompt-tuning` is the iteration loop this drops into.

## Pitfalls

- **Asking "is this AI-generated?"** Not visible in the subject. Returns a confident number that means nothing. Every question above is answerable from the text alone — that is why they are worded the way they are.
- **Scoring the whole document at once.** You get a number with no location. Ask per paragraph, aggregate in code.
- **Adding questions to improve coverage.** Of eight atomic signals measured in the Jev notes, seven could be removed without losing their own class — neighbours and the broad question picked them up. Calibrate one broad question well before adding a ninth narrow one.
- **Dropping the broad question once the atomic set looks good.** That is exactly when it starts carrying the unenumerated classes.
- **Letting the composition rule become the bug.** Decomposition is not free; the rule that combines six answers is code you now have to be right about.
