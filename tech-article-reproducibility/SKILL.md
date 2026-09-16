---
name: tech-article-reproducibility
description: Evaluate the reproducibility of technical articles. Dispatch a subagent to simulate a first-time reader reproducing the work locally and list missing information. Use as the final check on a draft before publication.
---

# Tech Article Reproducibility

Measure the quality of a technical article from the angle of "can a reader reproduce the same thing on their machine?" This is an independent axis from prose-style evaluation (mizchi-blog-style) or logical evaluation. The premise: **the most important thing about a technical article is whether a reader can reproduce it on their own machine.**

## When to use

- Final pre-publication check on a technical article draft
- Hands-on articles / tutorial articles
- Tool introduction articles / setup articles
- Verifying an article that claims "it worked"

When not to use:
- Conceptual explainer articles (nothing to reproduce)
- Poems / opinion pieces
- Self-contained small tidbits

## Reproducibility check axes (10 axes)

Score each axis on a 0–2 scale, 20 points total → converted to a 10-point scale.

| # | Axis | 0 (NG) | 1 (partial) | 2 (OK) |
|---|---|---|---|---|
| 1 | Environment prerequisites stated | No OS / version / required tools listed | Partially listed | Everything listed (OS, lang version, CLI tools) |
| 2 | Code completeness | Fragments only, imports/setup omitted | Only the main part | Full, copy-pasteable form that runs |
| 3 | Command accuracy | Placeholders left as-is (`<your-token>` etc. without explanation) | Some placeholders | Runnable as-is |
| 4 | Version dependency stated | No mention | Partial | Explicit, e.g. "works on v3.x", "v2 or earlier behaves as X" |
| 5 | Full config files included | Excerpts only | Main keys only | Full minimal working config |
| 6 | Expected output shown | None | Explained in prose | Actual output / screenshot |
| 7 | Handling of errors | Not mentioned | One case touched on | Several major errors + how to handle them |
| 8 | Project prerequisites stated | Author-environment assumptions are implicit | Partially stated | Paths / repo structure / existing config all stated |
| 9 | Link health | Links broken or require auth | Some require auth | All accessible publicly |
| 10 | Author-specific knowledge stated | Helpers / dotfiles assumed implicitly | Partially stated | Fully stated or not required |

## Evaluation workflow

For evaluating technical articles, use the same subagent dispatch as empirical-prompt-tuning. The difference is that the subagent plays the role of **"a first-time reader trying to reproduce the work"** rather than "an executor."

1. Fix the target article
2. subagent dispatch (template below)
3. Extract "reproduction sticking points" from the returned evaluation
4. Add / fix text in the article to address those sticking points
5. If needed, re-evaluate with a fresh subagent

## subagent dispatch template

```
You are a reader interested in <the article's subject area> but new to <the tech stack>.
You are going to read this article and try to reproduce the same thing in your local environment.

## Target article
<path to the article file>

## Evaluation axes (10 reproducibility axes)
Score each axis 0–2. Refer to the rubric in the `tech-article-reproducibility` skill:
/Users/mz/.claude/skills/tech-article-reproducibility/SKILL.md

1. Environment prerequisites stated
2. Code completeness
3. Command accuracy
4. Version dependency stated
5. Full config files included
6. Expected output shown
7. Handling of errors
8. Project prerequisites stated
9. Link health (actually verify with WebFetch)
10. Author-specific knowledge stated

## Tasks
1. While reading the article, imagine "where would I get stuck if I reproduced this on my own machine?"
2. Score each axis 0–2 with quoted evidence
3. List the top 5 sticking points with line numbers

## Report structure
- Reproducibility score: X/20 (breakdown table)
- Top 5 sticking points: <line number> <quote> → <why it sticks>
- Missing information: list of things that should be added to the article
- Overall verdict: what percentage chance (subjective) do you have of reproducing this after reading the article
```

## How to read the score

- **18-20**: Publishable as a hands-on piece; almost no additional information needed
- **14-17**: Some googling required, but reproducible; okay to publish
- **10-13**: Information outside the article is required to reproduce; revisions recommended
- **9 or below**: Hard to reproduce; rethink the article's premise or position it as something other than a hands-on piece

## Pitfalls

- **The evaluator's background knowledge is too high**: if you don't explicitly tell the subagent to play a "beginner role," it will judge "enough information" from an expert's viewpoint. Emphasize "first-time reader" in the prompt
- **Ignoring link health**: links that are alive at publication time can break a year later. Separately check whether reproduction is possible using only **live** links
- **Inlining all sample code**: reproducibility goes up, but the article bloats. A hybrid approach that combines inline code with a link to the repository is realistic
- **Reproducibility ≠ prose quality**: an article can be highly reproducible yet hard to read. Combine with `mizchi-blog-style` and similar to measure both axes

## Related

- `empirical-prompt-tuning` — meta-skill for subagent dispatch + iterative improvement
- `mizchi-blog-style` — evaluation on the prose-style axis (independent from this skill)
