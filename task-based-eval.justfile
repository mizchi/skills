set shell := ["bash", "-euo", "pipefail", "-c"]

test:
    node --test task-based-eval/tests/*.test.mjs
