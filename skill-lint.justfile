set shell := ["bash", "-cu"]
set positional-arguments

default:
    @just --justfile skill-lint.justfile --list

install:
    pnpm install --frozen-lockfile

install-skill:
    apm install --frozen

plan:
    pnpm lint:skills:plan

check:
    pnpm lint:skills --record .jev-lint/latest.json

translations-plan:
    pnpm lint:translations:plan

translations:
    pnpm lint:translations --record .jev-lint/translations-latest.json

policy-plan:
    pnpm lint:tool-policy --dry-run

policy:
    pnpm lint:tool-policy --record .jev-lint/tool-policy-audit.json

eval:
    pnpm lint:skills:eval

replay:
    pnpm lint:skills:replay

test:
    pnpm test:skill-lint
