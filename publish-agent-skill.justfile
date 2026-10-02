test:
    node --test publish-agent-skill/tests/*.test.mjs

check:
    ruby scripts/validate-skill-frontmatter.rb
    ruby scripts/gen-skill-readme.rb --check
