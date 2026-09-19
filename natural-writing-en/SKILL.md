---
name: natural-writing-en
description: English prose norm for writing explanatory text that does not read as machine-generated. One diagnostic axis (does a sentence update the situation or the document?) plus measured thresholds for burstiness, hedging, enumeration and paragraph openings, with corrections to widely-cited signals that false-positive on human technical writing. Use when drafting or revising English articles, docs, READMEs or long-form explanations, especially after an LLM produced the draft. For Japanese use natural-writing-ja; for scoring a draft use ai-index.
---

# Natural Writing — English

Writing English explanatory prose that reads as written by someone, about
something they did.

Same axis as `natural-writing-ja`, different surface. English machine prose has
its own habits — hedging preambles, balanced triples, Latinate verb inflation,
uniform sentence length — and several of the signals most often cited for
detecting it are wrong in ways that matter. The thresholds below are measured,
and the ones that failed are marked as failed.

## The axis

**Does this sentence update the situation, or update the document?**

| | what it reports | keep? |
| --- | --- | --- |
| situation | an event, a measurement, a number, something someone said; or the writer's own judgement state — a belief held, a doubt, a concession, a regret | yes |
| document | how this text looks, what it will cover, what was covered above, how to read it | delete |

```
✗ In this section, we will explore three approaches to caching.
✗ Having covered the basics, let's now turn to more advanced topics.
✗ It's important to note that there are trade-offs to consider here.
✗ This article will not attempt an exhaustive survey.
✓ All three properties show up in the failure from the first paragraph.
✓ I assumed the cache was the problem. It was not.
✓ I would rather not have shipped it this way.
```

The trap is the same as in Japanese and worth repeating: **a document-updating
sentence reshaped into a crisp declarative is still a document-updating
sentence.** "Let's take stock." reads like good prose and says nothing. Apply
the axis before judging rhythm.

Credit for the axis:
[k16shikano's cognitive-rhythm-writing norm](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432)
(written for Japanese; it transfers unchanged).

## Measured thresholds

From the human reference article (bharatsharma.pro, 1,813 prose words) against
an unedited-AI fixture. Full table in `ai-index/references/calibration.md`.

| signal | budget | human | AI |
| --- | --- | --- | --- |
| burstiness CV | ≥ 0.40 | **0.62** | 0.24 |
| rare style words | < 3 / 500w | 0.00 | 10.66 |
| corporate verbs (utilize, leverage, facilitate) | < 1 / 300w | 0.00 | 1.28 |
| empty openers ("In today's fast-paced…") | < 2 / 500w | 0.00 | 2.13 |
| uncited authority ("studies have shown") | < 1 / 500w | 0.00 | 4.26 |
| pseudo-wisdom ("at the end of the day") | < 2 / 500w | 0.00 | 4.26 |
| "not just X, but Y" | < 3 total | 0 | 3 |
| hedge preambles ("it's worth noting") | < 2 / 500w | 0.00 | 5.33 |
| paragraphs opening with a connector | ≤ 50% | 0% | 15% |

`python3 ../ai-index/scripts/slopscore.py draft.md` measures all of these.

## Signals that do not work

Four widely-cited tells, measured. Do not build on these, and do not let a
reviewer flag your draft on them.

**Type-token ratio is inverted.** The AI fixture scored *higher* lexical
diversity (MATTR 0.84) than the human article (0.80). A human writer repeats
`commit count`, `review queue`, `LOC` because consistent terminology is correct
technical writing. The model reaches for synonyms. So: **repeating a term is
usually right.** Do not vary vocabulary for variety's sake — that is the machine
habit, not the cure. (Plain TTR is worse: 0.42 on the same text, and it falls
with length, so it cannot be compared across documents at all.)

**The em-dash carries almost nothing.** Human and AI samples both measured 0.0
per 1000 words. It is the most-cited tell and, in this sample, the least
informative. Use em-dashes when you want the pause. The threshold worth
respecting is only the excess one (>20 per 1000 words); below that it says
nothing about authorship.

**Counting triples by shape false-positives on technical prose.** The published
budget is <1 polished triplet per 200 words; the human article measures **1.55**,
and 13 of its 14 hits are false positives:

```
real enumeration (fine, x12):  LOC, commit count and PR count
                               Microsoft, Accenture and a Fortune 100 company
                               review, validation and security
not a triple at all (x1):      if your platform is weak, AI makes it weaker
                               faster, and activity metrics will ...
abstract triple (a tell, x1):  verification, systems thinking, and accountability
```

The discriminator is **concreteness, not count**. Three things you could point
at is a list. Three abstractions balanced for rhythm is the tell. List real
things as often as you need to.

**The human burstiness band is lower than usually claimed.** Cited human range
is 0.6–1.2. Measured: 0.62 in English, and a floor of 0.36 across 18 Japanese
articles. A tool with its floor at 0.6 will flag most real writing.

## The beat

The human reference article, for calibration:

| measure | value |
| --- | --- |
| mean sentence length | 12.5 words |
| deciles | 4 / 6 / 9 / 11 / 13 / 15 / 17 / 19 / 24 |
| shortest / longest | 2w / 40w |
| very short (≤ 8w) | 35% of sentences |
| very long (≥ 35w) | 1% |
| burstiness CV | 0.62 |

Note the shape: **a third of sentences are eight words or shorter**, and almost
nothing is long. Machine prose clusters at 14–18 words with almost no short
sentences (the AI fixture: 3% short, 0% long, CV 0.24). The fix is not "write
shorter" — it is to let length follow the job. Plant a foothold in four words,
carry an argument in twenty-five, stop in three.

```
AI has not made engineering metrics obsolete.
That split is the whole argument.
The evidence for it is now good enough to act on.
```

Alternate assertion with genuine uncertainty. Hedging is a problem when it is
*preamble* ("it's worth noting that", "generally speaking") — decoration bolted
onto a claim. It is fine, and often the honest thing, when the uncertainty is the
content: "The research on AI productivity is a scatter plot, not a coefficient."
That sentence commits to a claim about the state of the evidence. "It's important
to note that the research is mixed" commits to nothing.

Cut every preamble in the second pass. A human editor does this reflexively;
it is precisely what an unedited model does not do.

## Openings

Open on an occasion or a correction, not an agenda. The human reference opens by
correcting a belief the reader probably holds:

```
AI has not made engineering metrics obsolete, only the activity proxies most
boards still see: lines of code, commit counts, PR counts and story points.
```

That does three things at once: states a position, names the specific target,
and leaves a tension open (so what *should* they see?). Forms that work:

- correct a common belief, then say what is true instead
- report what happened: "I spent a night with Jev. Here is what it does."
- state the position you will defend, and concede the strongest objection early
- restate the reader's own resistance in their words, then handle it briefly

What does not work: `This article explores X, Y and Z.` An attitude-free agenda
list is a document-updating sentence in the highest-value position in the piece.

## Closing

Close on something actionable or concrete, not a summary of what was argued.
The human reference ends on an instruction:

```
Take LOC, commit count and PR count out of the board pack.
```

Avoid: "In conclusion, …", "Ultimately, the key is to strike the right balance",
"Only time will tell". These are the three most common machine closings, and all
three are contentless — a reader cannot do anything differently after reading
them. If the honest ending is uncertainty, name the specific uncertainty and what
would resolve it.

## The AI-smell table

| pattern | machine | fix |
| --- | --- | --- |
| hedge preamble | It's important to note that X | X |
| empty opener | In today's fast-paced world of Y | delete; start at the claim |
| uncited authority | Studies have shown that X | name the study, or "I found that X" |
| corporate verb | utilize / leverage / facilitate | use / use / help |
| style vocabulary | delve, tapestry, nuanced, robust, seamless, holistic, cornerstone | delete, or replace with a number |
| balanced abstract triple | verification, systems thinking, and accountability | name the concrete things, however many there are |
| not-just-X-but-Y | not just a technical problem, but an organizational one | pick one, or state both plainly |
| connector stacking | Furthermore / Moreover / Additionally opening paragraphs | delete; the order carries the logic |
| false symmetry | every section as Overview / Benefits / Drawbacks / Summary | let section length follow content |
| bullet inflation | claims as bullets | claims in prose; bullets for real enumerations |
| generic example | For example, a company might… | your own repo, commit, measurement |
| summary closing | In conclusion, we have explored… | the instruction, or the open question |

## Post-draft checks

1. **Topic test.** Every paragraph-opening sentence and every standalone short
   sentence: situation or document? Cut the document side. Re-test anything you
   rewrote — a cut sentence reshaped into a punchy one is the main re-entry path.
2. **Deletion test.** After each paragraph, name one specific thing learned — a
   name, number, date, mechanism, or trade-off. More than a third failing means
   the problem is substance, and no amount of editing fixes it.
3. **Preamble sweep.** Delete every "it's worth noting", "generally speaking",
   "that said", "ultimately". Read the result; almost none will be missed.
4. **Beat check.** Find runs of three or more sentences of similar length. Break
   one short. Check that some sentence in the piece is under six words.
5. **Authority check.** Every claim about what is known needs a name, number,
   link, or first-person observation attached. Otherwise state it as your view.
6. **Run the lint** — `python3 ../ai-index/scripts/slopscore.py draft.md`.
   **A clean result means the surface is clean and nothing more.** Text that
   passes the lint while failing checks 1 and 2 is the specific failure mode to
   avoid; `ai-index` §3 has a worked counterexample that scores better than real
   human writing while saying nothing.

## Diagnosing flat prose

| symptom | cause | fix |
| --- | --- | --- |
| fluent, correct, unreadable | every sentence updates the document | check 1 |
| nothing to disagree with | no position taken | state which side you are on in the opening |
| all sentences the same length | no beat | check 4; CV below 0.40 |
| every claim softened | hedging as decoration | check 3; keep uncertainty only where it is the content |
| reads like any article on the topic | no first-hand material | replace generic examples with what you actually ran |
| sections symmetric | structure imposed before content | let length follow content; delete empty sections |
| closing says nothing | summary instead of consequence | end on the instruction or the open question |

## Related

- `ai-index` — scoring a draft; measured baselines; the gap-first calibration procedure
- `natural-writing-ja` — the Japanese counterpart (different signals, different thresholds)
- `optimizing-descriptions` — for skill and API descriptions, where these rules do not apply
