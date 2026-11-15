require "json"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class WorkflowCredentialsTest < Minitest::Test
  def workflow(name)
    YAML.safe_load(File.read(File.expand_path("../workflows/#{name}.yml", __dir__)))
  end

  def deploy_step(name)
    workflow("deploy").fetch("jobs").fetch("deploy").fetch("steps").find { |step| step["name"] == name } || raise(name)
  end

  def test_callers_require_cloudflare_credentials_without_a_dotenvx_key
    %w[cd-staging cd-production].each do |name|
      script = workflow(name).fetch("jobs").fetch("precheck").fetch("steps").first.fetch("run")
      [
        ["", "", false], ["token", "", false], ["", "account", false],
        ["token", "account", true]
      ].each do |token, account, ready|
        Dir.mktmpdir("cd-precheck-") do |dir|
          output = File.join(dir, "output")
          _, stderr, status = Open3.capture3({
            "CLOUDFLARE_API_TOKEN" => token, "CLOUDFLARE_ACCOUNT_ID" => account,
            "GITHUB_OUTPUT" => output, "DOTENV_PRIVATE_KEY_CLOUDFLARE" => nil
          }, "bash", "-euo", "pipefail", "-c", script)
          assert status.success?, stderr
          assert_equal "ready=#{ready}\n", File.read(output)
        end
      end
    end
  end

  def test_reusable_auth_contract_is_forwarded_by_both_callers
    reusable = workflow("deploy")
    triggers = reusable["on"] || reusable[true]
    required = triggers.fetch("workflow_call").fetch("secrets")
    %w[CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID].each do |credential|
      assert_equal true, required.fetch(credential).fetch("required")
      %w[cd-staging cd-production].each do |name|
        forwarded = workflow(name).fetch("jobs").fetch("deploy").fetch("secrets")
        assert_equal "${{ secrets.#{credential} }}", forwarded.fetch(credential)
      end
      assert_equal "${{ secrets.#{credential} }}", reusable.fetch("jobs").fetch("deploy").fetch("env").fetch(credential)
    end
  end

  def run_step(step, extra_env)
    Dir.mktmpdir("cd-step-") do |dir|
      receipt = File.join(dir, "receipt.json")
      pnpm = File.join(dir, "pnpm")
      File.write(pnpm, <<~'RUBY')
        #!/usr/bin/env ruby
        require "json"
        abort "Unexpected command: #{ARGV.inspect}" unless ARGV[0, 2] == ["exec", "cf"] || ARGV == ["run", "smoke"]
        abort "Missing Cloudflare authentication" unless ENV["CLOUDFLARE_API_TOKEN"] == "fixture-token" && ENV["CLOUDFLARE_ACCOUNT_ID"] == "fixture-account"
        File.write(ENV.fetch("RECEIPT"), JSON.generate({
          "argv" => ARGV,
          "access_id" => ENV["CF_ACCESS_CLIENT_ID"],
          "access_secret" => ENV["CF_ACCESS_CLIENT_SECRET"]
        }))
      RUBY
      File.chmod(0o755, pnpm)
      env = {
        "PATH" => "#{dir}:#{ENV.fetch('PATH')}", "RECEIPT" => receipt,
        "CLOUDFLARE_API_TOKEN" => "fixture-token", "CLOUDFLARE_ACCOUNT_ID" => "fixture-account",
        "DOTENV_PRIVATE_KEY_CLOUDFLARE" => nil
      }.merge(extra_env)
      _, stderr, status = Open3.capture3(env, "bash", "-euo", "pipefail", "-c", step.fetch("run"))
      assert status.success?, stderr
      JSON.parse(File.read(receipt))
    end
  end

  def test_migrations_use_existing_process_credentials
    receipt = run_step(deploy_step("Apply D1 migrations"), "DATABASE_ID" => "fixture-db")
    assert_equal ["exec", "cf", "d1", "migrations", "apply", "fixture-db", "--dir", "db/migrations"], receipt.fetch("argv")
  end

  def test_smoke_selects_mode_credentials_without_an_env_loader
    %w[production staging].each do |mode|
      receipt = run_step(deploy_step("Run post-deploy smoke"), {
        "TARGET_MODE" => mode,
        "CF_ACCESS_CLIENT_ID" => "production-id", "CF_ACCESS_CLIENT_SECRET" => "production-secret",
        "CF_ACCESS_CLIENT_ID_STAGING" => "staging-id", "CF_ACCESS_CLIENT_SECRET_STAGING" => "staging-secret"
      })
      assert_equal ["run", "smoke"], receipt.fetch("argv")
      assert_equal "#{mode}-id", receipt.fetch("access_id")
      assert_equal "#{mode}-secret", receipt.fetch("access_secret")
    end
  end
end
