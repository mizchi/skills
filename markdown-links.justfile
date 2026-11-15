set shell := ["bash", "-euo", "pipefail", "-c"]

install:
    node scripts/install-lychee.mjs

check:
    node scripts/check-markdown-links.mjs

online:
    node scripts/check-markdown-links.mjs --online

list:
    node scripts/check-markdown-links.mjs --list

test:
    node --test scripts/markdown-links_test.mjs
