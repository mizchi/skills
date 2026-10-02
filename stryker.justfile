# Run with: just --justfile stryker.justfile test-stryker
test-stryker:
    node --test stryker-js/tests/*.test.mjs

check-skills:
    ruby scripts/validate-skill-frontmatter.rb
    ruby scripts/gen-skill-readme.rb --check

gen-readme:
    ruby scripts/gen-skill-readme.rb
