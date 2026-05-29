# Example: echo-skill

Minimal end-to-end waxa eval. The `echo-skill` does nothing interesting
on purpose so the eval machinery is the part you read.

## Layout

```
echo-skill/
├── .waxa.yaml                                  # repo-root config
├── skills/echo-skill/SKILL.md                  # skill under test
└── evals/echo-skill/
    ├── eval.yaml                               # eval suite
    └── tasks/
        ├── hello.yaml                          # smoke task
        └── symbols.yaml                        # edge task
```

## Run

From the `echo-skill/` directory:

```bash
# single run, all tasks (2 trials each, see eval.yaml)
waxa evals/echo-skill/eval.yaml

# pick a single task
waxa evals/echo-skill/eval.yaml --task echo-hello

# iterate (writes evals/echo-skill/ledger.yaml)
waxa iterate evals/echo-skill/eval.yaml --max 3

# multi-model comparison (objective axes only — no LLM A-vs-B)
waxa compare evals/echo-skill/eval.yaml \
  --models claude-opus-4-8,claude-haiku-4-5-20251001

# A/B a candidate skill
cp -r skills/echo-skill skills/echo-skill-v2
$EDITOR skills/echo-skill-v2/SKILL.md
waxa variant evals/echo-skill/eval.yaml \
  --base echo-skill --candidate echo-skill-v2
```

## What this example deliberately does NOT show

- Production-grade rubrics for the `llm` grader (the echo task is too
  trivial to need one). The `skill-selector` eval at
  [mizchi/skills:evals/skill-selector/](https://github.com/mizchi/skills/tree/main/evals/skill-selector)
  exercises every grader type with realistic rubrics.
- `parallel: true` (overkill for a 2-task eval).
- A populated `ledger.yaml` (you produce one yourself by running
  `waxa iterate`).
