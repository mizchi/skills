install:
    pnpm install --frozen-lockfile

plan:
    pnpm lint:freshness --dry-run

check:
    pnpm lint:freshness

test:
    pnpm test:freshness
    pnpm test:frontend-audit
    pnpm test:audit-report
    pnpm freshness:controls
    pnpm frontend:sync:check

# Accept only after reviewing drift, semantic candidates and relevant smoke checks.
accept:
    pnpm lint:freshness --accept
