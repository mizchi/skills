#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"
require "yaml"

Error = Struct.new(:path, :line, :column, :message, keyword_init: true)

def repo_root
  stdout, status = Open3.capture2("git", "rev-parse", "--show-toplevel")
  return nil unless status.success?

  stdout.strip
end

def tracked_skill_files
  root = repo_root
  return [] unless root

  stdout, status = Open3.capture2(
    "git",
    "-C",
    root,
    "ls-files",
    "-z",
    "--",
    ":(glob)**/SKILL.md",
  )
  return [] unless status.success?

  stdout.split("\0").reject(&:empty?).map { |path| File.join(root, path) }
end

def input_files
  files = ARGV.empty? ? tracked_skill_files : ARGV
  files.select { |path| File.basename(path) == "SKILL.md" }.sort
end

def frontmatter_for(path)
  lines = File.readlines(path)
  unless lines.first&.chomp == "---"
    return [nil, Error.new(path: path, line: 1, column: 1, message: "missing YAML frontmatter")]
  end

  close_index = lines[1..]&.find_index { |line| line.chomp == "---" }
  unless close_index
    return [nil, Error.new(path: path, line: 1, column: 1, message: "missing closing frontmatter delimiter")]
  end

  [lines[1...(close_index + 1)].join, nil]
end

def safe_load_yaml(yaml)
  YAML.safe_load(yaml, permitted_classes: [], permitted_symbols: [], aliases: false)
end

def validate(path)
  frontmatter, error = frontmatter_for(path)
  return error if error

  begin
    parsed = safe_load_yaml(frontmatter)
  rescue Psych::SyntaxError => e
    file_line = e.line ? e.line + 1 : nil
    message = "invalid YAML frontmatter: #{e.problem || e.message}"
    return Error.new(path: path, line: file_line, column: e.column, message: message)
  end

  unless parsed.is_a?(Hash)
    return Error.new(
      path: path,
      line: 2,
      column: 1,
      message: "frontmatter must be a YAML mapping",
    )
  end

  nil
end

def print_error(error)
  location = +"#{error.path}"
  location << ":#{error.line}" if error.line
  location << ":#{error.column}" if error.column
  warn "#{location}: #{error.message}"
end

files = input_files
errors = files.map { |path| validate(path) }.compact

if errors.empty?
  puts "skill frontmatter ok (#{files.length} files)"
  exit 0
end

warn "skill frontmatter check failed (#{errors.length} errors)"
errors.each { |error| print_error(error) }
exit 1
