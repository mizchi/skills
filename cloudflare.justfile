default:
    @just --justfile cloudflare.justfile --list

# Exercise Cloudflare deployment snapshots and secret delivery without remote mutations.
test-cloudflare:
    node --test cloudflare-workers-cd-rollback/assets/scripts/deployment-state.test.ts utels-project-bootstrap/assets/scripts/setup-utels.test.ts cloudflare-mbt-worker-bundle/assets/scripts/check-worker-bundle.test.ts

check-cloudflare: test-cloudflare
    ruby scripts/validate-skill-frontmatter.rb
    ruby scripts/gen-skill-readme.rb --check
