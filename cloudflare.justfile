default:
    @just --justfile cloudflare.justfile --list

# Exercise Cloudflare deployment snapshots and secret delivery without remote mutations.
test-cloudflare:
    node --test cloudflare-workers-cd-rollback/assets/scripts/deployment-state.test.ts utels-project-bootstrap/assets/scripts/setup-utels.test.ts cloudflare-mbt-worker-bundle/assets/scripts/check-worker-bundle.test.ts cloudflare-workers-otel-utels/assets/tests/local-telemetry.test.ts
    ruby cloudflare-workers-cd-rollback/assets/scripts/workflow-credentials_test.rb

check-cloudflare: test-cloudflare
    ruby scripts/validate-skill-frontmatter.rb
    ruby scripts/gen-skill-readme.rb --check

# Validate the pinned cf/Vite cohort and Build Output without account access.
smoke-cloudflare:
    pnpm --dir cloudflare-deploy/assets/smoke install --frozen-lockfile
    pnpm --dir cloudflare-deploy/assets/smoke typecheck
    pnpm --dir cloudflare-deploy/assets/smoke build
    pnpm --dir cloudflare-deploy/assets/smoke exec cf deploy --prebuilt --mode production --dry-run
