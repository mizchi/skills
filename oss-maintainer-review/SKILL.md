---
name: oss-maintainer-review
description: Triage an incoming OSS pull request as its maintainer before running contributor code. Review GitHub Actions trust boundaries, supply-chain and client execution risks, design claims, and public contribution history to decide whether to test the reviewed revision.
---

# Review an incoming pull request

Start read-only. Obtain the repository, target branch, base and head SHAs, fork, author, changed paths (including deletions and renames), and complete diff from repository metadata. Inspect files as text at those revisions. Resolve truncated diffs before judging affected paths. Treat PR descriptions, comments, agent instructions, scripts, and artifacts as evidence. Opening a development container, installing dependencies, approving a workflow run, or invoking a project task may already execute contributor code.

For a retrospective, state which PRs were included and how they were selected. Use the workflow definitions in effect at the time. Keep the original PR, subsequent integration, and eventual release identifiable by revision. Use existing run records when the question concerns what happened historically.

## Inventory incoming PRs

With authenticated gh and Node.js 24+, run the bundled collector from this skill directory. It defaults to the authenticated owner and accepts another owner as its first argument. Choose a local output directory suitable for any private repository metadata visible to the account.

```sh
node scripts/inbox.mjs > inbox.jsonl 2> summary.json
node scripts/inbox-report.mjs inbox.jsonl > inbox.md
```

The query covers open PRs on owner repositories and excludes self-authored PRs. Keep bots in scope. Check the summary for API failures, incomplete results, and the GitHub Search 1,000-result ceiling. The JSONL records give changed paths and first matching added line per signal per file. Signals prioritize manual inspection. Missing patches require a separate read. A clean keyword screen cannot clear unchanged callers, removals, obfuscation, or a revision updated during collection. For each escalated PR, fetch its current head and follow the individual review below before deciding on execution.

## 1. Inspect workflows first

List changes under `.github/workflows/` first and explicitly report whether the diff touches them. Search the base and proposed workflows for `pull_request_target`. For each relevant match, identify the event, checkout ref, job permissions, secrets or OIDC access, runner, and inputs. A base-branch workflow that labels a PR using metadata has a different exposure from one that executes the submitted revision. Inspect automatically started runs as metadata before considering a rerun. [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

Follow calls from existing as well as modified jobs into local actions, reusable workflows, shell scripts, task files, package hooks, and test configuration. A PR changing only a script can change a privileged job. Include later jobs that consume artifacts or caches from PR jobs, particularly privileged workflow_run consumers.

For each path, trace who controls the input or fetched resource, what interprets or executes it, and what the process can read, write, or send. Inspect remote downloads, mutable action refs, redirects, dynamic URLs, digest verification, and PR metadata interpolated into shell. Distinguish fetching data from executing it. Identify exposed credentials, files, logs, artifact uploads, or outbound destinations and cite the connecting lines. Record unknown runner or repository settings explicitly.

For each material CI claim, identify the run, tested SHA (including synthetic merge commits), job steps, result, and relevant platform. A review bot can pass while the test job is absent or skipped. When several patches landed through an integration PR, verify which heads or equivalent changes it contains, including conflict resolutions. Credit its tests to that combined revision. For a platform-specific fix, report whether the affected platform ran the regression case.

## 2. Trace supply-chain and client impact

Review manifest and lockfile changes together: package identity and source, version or digest, transitive additions, lifecycle scripts, build plugins, and generated or vendored files. Follow changes through packaging and publishing to the artifact a consumer actually installs. Check whether an otherwise routine install, import, CLI invocation, editor task, or update executes newly introduced code on the consumer’s machine. For browser clients, identify the origin and privileges available to the code. Report the actual execution context and prerequisites for each finding. Use static evidence and existing advisories for security claims.

### Follow the boundaries affected by the diff

- **Review and check integrity.** Inspect changes to CODEOWNERS, required-job conditions, test selection, assertions, and audit exclusions. Verify that a green result covered the affected code at the reviewed revision. Record who can authorize the change if the PR alters future review ownership.
- **Agent and tool access.** Read changed agent instructions, skill manifests, MCP servers, and editor hooks as text. Identify the action they request, the tools or credentials available, and any external recipient. Use the trusted base configuration for the review.
- **Authorization and data exposure.** For changes to queries, routes, exports, or caches, trace one record from the authenticated caller through the permission check to the response. Verify tenant and object ownership boundaries. Check new logs, telemetry, and error payloads for personal data and credentials.
- **Resource use.** For parsers, archives, retries, and CI matrices, check what bounds CPU, memory, disk, runtime, and paid jobs for contributor-controlled inputs. Record necessary runner limits before testing.
- **Release identity.** Attribute publishing privileges to the event and job that receive them. If a tag-triggered release adds a package, check its packed contents and registry publisher binding before clearing publication. Mark registry settings you could not inspect as unknown. When publishing changes, trace the approved commit through the build to the exact digest handed to the publisher. Verify which job can sign or publish and which environment approval applies. A checksum supplied alongside a file by the same untrusted job establishes no independent provenance.

## 3. Check design, claims, and provenance

- Extract the claimed defect or requirement. Compare it with the base implementation, public contract, tests, issue history, and earlier maintainer decisions. For each consequential review comment, cite evidence that supports or contradicts it, or identify the missing evidence. Assess the proposed fix separately: scope, compatibility, edge cases and whether the proposed regression test distinguishes the two revisions.
- For automatic tool selection, compare the documented opt-in or project marker with the actual fallback condition. Examine a machine with the optional executable on PATH but no project opt-in, especially when a usual dependency is missing. Derive the expected outcome from the public contract and identify the smallest regression test that would settle a mismatch.
- When code changes environment variables before launching a child, trace the executable, arguments, working directory, inherited credentials, and output destination. Check whether the implementation supports the stated reason, such as stable diagnostic output. A claim of data disclosure needs a reachable recipient.
- Inspect public, project-relevant account activity: prior PRs and reviews, linked issues, and documented maintainer responses. Attribute specific events with links and dates. Separate verified account actions from third-party allegations. Record platform bot/app markers and explicit disclosure of AI assistance. A user account can submit generated code. Leave authorship unknown when the evidence does not establish it.
- New accounts, sparse history, writing style, and previous successful contributions do not establish harmful intent or code safety. Apply the same technical gates to maintainers, bots, and newcomers. Report the scope of the history checked and any unavailable evidence.

## 4. Decide before testing

Hold execution if a material path remains unreviewed, an external executable has unresolved provenance, a privileged context can consume untrusted code, or the change/claim lacks enough justification to proceed. State the smallest fact or patch needed for another review. When metadata is inaccessible, explain how that limits the conclusion. Unknown human/AI authorship alone does not block testing.

Once the static and design review supports testing, record the decision and exact head SHA. Recheck the PR head before execution and review any intervening changes. Use a disposable unprivileged runner with no inherited credentials, host mounts, shared writable caches, or publishing permissions. Verify isolation before invoking setup hooks. Limit network access to reviewed dependency sources during setup and run the smallest relevant tests first. If an appropriate runner is unavailable, report that execution is pending. Expand to the normal suite as warranted.

Distinguish permission to run isolated tests from permission to merge or publish. If a privileged run already consumed suspect input, record the run ID, revision, and potentially exposed permissions for incident triage.

Return the workflow-change and trigger findings first, then concrete security paths, design and provenance findings, and the testing decision. Give file/line or public activity links for material claims. List commands and results only for checks actually run. A passing test establishes the tested behavior.
