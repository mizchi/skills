set shell := ["bash", "-euo", "pipefail", "-c"]

test:
    node --test blind-api-eval/tests/*.test.mjs
