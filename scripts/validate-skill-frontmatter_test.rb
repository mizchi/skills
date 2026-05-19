# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "rbconfig"
require "tmpdir"

SCRIPT = File.expand_path("validate-skill-frontmatter.rb", __dir__)

class ValidateSkillFrontmatterTest < Minitest::Test
  def run_script(*paths)
    Open3.capture3(RbConfig.ruby, SCRIPT, *paths.map(&:to_s))
  end

  def write_skill(dir, body)
    path = File.join(dir, "SKILL.md")
    File.write(path, body)
    path
  end

  def test_accepts_valid_yaml_frontmatter_with_quoted_colon
    Dir.mktmpdir do |dir|
      skill = write_skill(dir, <<~MD)
        ---
        name: example-skill
        description: "Use when a description contains: a colon."
        ---

        # Example Skill
      MD

      stdout, stderr, status = run_script(skill)

      assert status.success?, stderr
      assert_includes stdout, "skill frontmatter ok (1 files)"
    end
  end

  def test_rejects_invalid_yaml_frontmatter
    Dir.mktmpdir do |dir|
      skill = write_skill(dir, <<~MD)
        ---
        name: broken-skill
        description: Use when a description contains: an unquoted colon.
        ---

        # Broken Skill
      MD

      _stdout, stderr, status = run_script(skill)

      refute status.success?
      assert_includes stderr, "invalid YAML frontmatter"
      assert_includes stderr, "SKILL.md:3"
    end
  end

  def test_rejects_missing_frontmatter
    Dir.mktmpdir do |dir|
      skill = write_skill(dir, "# No Frontmatter\n")

      _stdout, stderr, status = run_script(skill)

      refute status.success?
      assert_includes stderr, "missing YAML frontmatter"
    end
  end

  def test_rejects_non_mapping_frontmatter
    Dir.mktmpdir do |dir|
      skill = write_skill(dir, <<~MD)
        ---
        - name
        - description
        ---

        # Broken Skill
      MD

      _stdout, stderr, status = run_script(skill)

      refute status.success?
      assert_includes stderr, "frontmatter must be a YAML mapping"
    end
  end
end
