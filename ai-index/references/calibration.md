# Calibration — measured baselines and per-signal gaps

Every number here is reproducible from the commands shown. Re-derive them before
trusting them on a different corpus; thresholds transfer badly, procedures transfer well.

## Corpora

| label | what | n | provenance |
| --- | --- | --- | --- |
| human JA | mizchi Zenn articles, 2025-06 → 2026-09 | 18 | `zenn.dev/api/articles/<slug>`, `body_html`, code blocks stripped |
| human EN | bharatsharma.pro, "activity-based engineering metrics are obsolete" | 1 | fetched article body, prose blocks only |
| AI JA | `fixtures/ai_ja.md` | 1 | synthetic, written as unedited model output |
| AI JA laundered | `fixtures/ai_ja_laundered.md` | 1 | `ai_ja.md` with only Layer A complaints fixed |
| AI EN | `fixtures/ai_en.md` | 1 | synthetic, written as unedited model output |

The human JA corpus is 937 prose sentences / 64,340 characters after excluding
code blocks, list items and headings from sentence statistics.

Rebuild it:

```bash
for p in 1 2; do curl -sS "https://zenn.dev/api/articles?username=mizchi&order=latest&page=$p" -o "p$p.json"; done
# then per slug:
curl -sS "https://zenn.dev/api/articles/<slug>" | python3 -c 'import json,sys; print(json.load(sys.stdin)["article"]["body_html"])' > <slug>.html
python3 ../scripts/slopscore.py --baseline *.html
```

## Layer A tell counts

```
                                CV  tells   MATTR   reg%
ai_ja.md (AI, unedited)       0.32      7   0.723    100
llm-aware-ts-project-starter  0.36      0   0.833    100
ai_ja_laundered.md (AI!)      0.38      0   0.682    100
introduce-actrun              0.42      0   0.794    100
introduce-lsmcp               0.43      0   0.830       -
react-ink-renderer-for-ai-age 0.48      1   0.787    100
quint-application-modeling    0.48      0   0.804    100
moonbit-is-good-2025          0.49      1   0.820    100
markdown-incremental-preview  0.50      0   0.821    100
gemini-cli-for-google-search  0.52      0      -        -
build-my-own-layout-engine    0.53      1   0.786    100
introduce-ts-similarity       0.53      0   0.797     97
claude-code-singularity-point 0.54      0   0.794    100
dena-ai-live-coding           0.55      0   0.857    100
moonbit-luna-ui               0.56      0   0.745    100
claude-code-cheatsheet        0.56      0   0.779     86
jev-is-gpu-for-llms           0.57      1   0.821    100
jev-plays-gomoku              0.59      0   0.807    100
think-next-language-with-unison 0.64    1   0.722     98
empirical-prompt-tuning       0.66      0   0.797     96

human JA:  tells 0-1,  CV 0.36-0.66
human EN:  tells 0,    CV 0.62
AI  JA:    tells 7,    CV 0.32
AI  EN:    tells 8,    CV 0.24
```

`ai_ja_laundered.md` sits at **0 tells** — strictly better than 5 of the 18
genuine human articles, and tied with the other 13 — with no content added.
That row is the argument for Layer B.

## Per-signal gap table

Margin = (worst human) − (AI), oriented so positive means the signal separates.

### Japanese

| signal | human range | AI | margin | verdict |
| --- | --- | --- | --- | --- |
| tells over budget | 0–1 | 7 | **+6** | wide — usable |
| burstiness CV | 0.36–0.66 | 0.32 | +0.04 | **narrow — advisory only** |
| register purity | 86–100% | 100% | −14 | no separation on unedited AI; still a real *writing* rule (see below) |
| 体言止め / 10k chars | 0.0–8.8 | 0.0 | 0.00 | human floor is zero — cannot gate |
| 反問 / 10k chars | 0.0–20.2 | 0.0 | 0.00 | human floor is zero — cannot gate |
| MATTR(100) | 0.72–0.86 | 0.72 | 0.00 | overlaps — report only |

### English

| signal | human | AI | margin | verdict |
| --- | --- | --- | --- | --- |
| tells over budget | 0 | 8 | **+8** | wide — usable |
| burstiness CV | 0.62 | 0.24 | **+0.38** | wide — usable (unlike JA) |
| em-dash / 1000w | 0.0 | 0.0 | 0.00 | no separation in this sample |
| MATTR(100) | 0.80 | 0.84 | **−0.04** | **inverted** — AI scored more diverse |
| tricolons / 200w | 1.55 | — | — | human *exceeds* the published <1 threshold; 13 of 14 hits are false positives |

## Findings that contradict published thresholds

1. **Type-token ratio is the wrong direction.** The usual claim is that AI has
   narrower vocabulary. Measured here, the AI fixture had *higher* MATTR (0.84)
   than human technical prose (0.80). A human writer repeats `commit count`,
   `review queue`, `LOC` because consistent terminology is correct technical
   writing; a model reaches for synonyms. Report MATTR, never score it.

2. **Plain TTR is unusable.** Same English text: TTR 0.418, MATTR(100) 0.801.
   TTR falls as documents get longer, so it cannot be compared across documents.
   Use a moving-window measure or nothing.

3. **The tricolon threshold has a 93% false-positive rate on technical prose.**
   Published guidance is <1 polished triplet per 200 words. The human reference
   article measures 1.55. Breaking the 14 hits down:

   | | n | example |
   | --- | --- | --- |
   | real enumeration of domain nouns | 12 | `LOC, commit count and PR count`, `Microsoft, Accenture and a Fortune 100 company` |
   | not a triple at all (regex mis-parse of a comma splice) | 1 | `if your platform is weak, AI makes it weaker faster, and activity metrics will` |
   | the abstract rhetorical triple the signal is about | **1** | `verification, systems thinking, and accountability` |

   So 13 of 14 are false positives, and one of those is the detector's own
   parsing rather than the threshold's fault. **Concreteness, not count, is the
   discriminator** — and that is a judgment question, not a regex (question B4
   in `jev-questions.md`).

4. **Burstiness does not transfer between languages.** CV separates cleanly in
   English (+0.38) and barely at all in Japanese (+0.04). Japanese sentence
   length varies for reasons unrelated to authorship — 体言止め, fragments,
   inline code density — so the human range is wide in both directions. Any
   tool applying one CV floor to both languages is guessing in one of them.

5. **Human burstiness is lower than usually claimed.** The cited human band is
   0.6–1.2. The measured human floor is 0.36 (JA) and 0.62 (EN) — at or below
   the bottom of that band. A floor set at 0.6 would flag most of a real corpus.

6. **The em-dash carries almost no information.** Both the human and AI English
   samples measured 0.0 per 1000 words. It is the most-cited tell and, in this
   sample, the least useful.

## Discourse shape — the signals that actually separate (JA)

Added after the marker-rate approach failed. A draft tuned to hit every lexical
rate in the mizchi profile (`自分` 11.1 vs 11.5 measured, sentence length 40 vs
43.6) still read as pastiche, so the corpus was re-measured at the paragraph and
section level instead of the token level.

| signal | mizchi (n=18, 766 paras) | AI unedited | marker-tuned draft |
| --- | --- | --- | --- |
| sentences per paragraph | **1.45** (range 1.2–2.0) | 2.46 | **3.27** |
| one-sentence paragraphs | **64%** (39–86%) | 15% | 13% |
| paragraphs of 5+ sentences | **0%** (0–2.7%) | 0% | **23%** |
| first paragraph, sentences | **1–2** (11x1, 7x2) | 3 | 3 |
| headings that are noun labels | **84%** (149/178) | — | 62% |
| heading length | median 12 chars, 41% ≤10 | — | median 12 |
| prose chars between code blocks | median **102** | 396 | 1105 |
| section length | median 313 chars, CV 0.57–0.70, min 18 max 1180 | CV 0.22 | CV 0.37 |

**The marker-tuned draft is further from the corpus than unedited AI output on
the decisive axis.** Paragraph granularity is where hand-written Japanese tech
prose and block-shaped output differ most, and no phrase substitution moves it.

Two methodological notes:

- **The paragraph breaks are real.** Zenn keeps the markdown source line in
  `data-line`, and across consecutive `<p>` pairs the line delta is never 1
  (0 of 252) — every boundary has a blank line. This is authored formatting,
  not a soft-break rendering artifact.
- **Heading form beats heading length.** The marker-tuned draft matched the
  median heading length (12 chars) exactly while writing statement-form
  headings (`自分のシグナルが 3 つ死んだ`). The corpus writes noun labels
  (`作ったもの`, `実装手順`) 84% of the time and questions 9%; statements are 7%.

Closing move, counted by hand over all 18 final paragraphs: the dominant form is
**forward-looking** — what the author does next, an invitation to the reader, or
a promise of unfinished work (`自分は次に、これを使って GitHub 以外で動く CI 環境を
作っています`, `もうちょっと練ったら後で紹介したい`, `皆さんもブラウザを作りましょう`).
Summarising to close appears zero times. An earlier version of the style skill
claimed `おわり` was the idiom; it is not in the corpus at all.

`slopscore.py --lang ja` reports the first five of these under "discourse shape".

## Register purity — a real rule with no gap

18 of 18 human JA articles hold one register (敬体 or 常体) at ≥80% purity;
14 are at 100%. Distribution: 14 敬体-dominant, 4 常体-dominant, 0 mixed.

The AI fixture also scored 100%, so this does **not** detect unedited AI. It
matters anyway, for two reasons: mixed register is a strong tell in *edited*
prose, where a human has patched model output paragraph by paragraph and the
register drifts at the seams; and it is a hard, checkable writing rule with an
unusually clean empirical basis. Kept in the script as a writing check, excluded
from the detection claim.

## Recalibration procedure

1. Collect ≥15 human documents in the target voice and ≥5 AI documents in the
   target failure mode. A labeled corpus of this size is worth more than any
   amount of threshold tuning.
2. `slopscore.py --baseline` over both sets.
3. Build the gap table. Margin positive and wide → keep, threshold anywhere in
   the gap. Margin narrow or inverted → **rewrite the signal**, do not tune.
4. Fit thresholds on the *human* side and back off one step from the boundary.
   Fitting to `max(human) + epsilon` puts the threshold exactly on the
   false-positive boundary; the next ten documents will cross it.
5. Hold out a few human documents and confirm zero false positives before shipping.
6. Re-run after any edit to `EN_RULES` / `JA_RULES`.
