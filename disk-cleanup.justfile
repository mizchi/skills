set shell := ["bash", "-euo", "pipefail", "-c"]

test:
    node --test disk-cleanup/scripts/survey_test.mjs

survey:
    node disk-cleanup/scripts/survey.mjs
