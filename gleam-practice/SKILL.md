---
name: gleam-practice
description: Best practices for building and reviewing Gleam projects on the Erlang target, especially Wisp plus Mist web services, OTP processes, justfile workflows, testing, formatting, CI, and performance measurement.
---

# Gleam Practice

Use this when creating a new Gleam project, improving an existing one, or implementing with a `wisp + mist + gleam_otp + just` stack.

## Default Workflow

- Start with `gleam new` and `gleam add`. Let the solver choose dependencies instead of hand-writing them.
- Proceed TDD-style: `explore -> Red -> Green -> Refactor`.
- Separate pure logic from state management. Split domain modules from actor/server modules.
- Keep the public API small. Prefer `pub opaque type` and avoid casually exposing internal constructors or protocol types.
- Treat `@external` as a last resort. When you do use it, contain it inside a thin adapter module.
- Keep the web layer thin. `wisp` handlers should focus on decode, call service, encode response.
- Centralize task execution in a `justfile`, and have CI invoke `just ci` too.

## Project Setup

Use this as the starting point for new Erlang-target projects.

```sh
gleam new my_app --template erlang
cd my_app
gleam add wisp mist gleam_otp gleam_erlang
gleam add gleam_json envoy
gleam add --dev gleeunit
```

Add the following as needed.

- HTTP client: `gleam add gleam_http gleam_httpc`
- file I/O: `gleam add simplifile filepath`
- snapshot test: `gleam add --dev birdie`
- property test: `gleam add --dev qcheck qcheck_gleeunit_utils`
- interactive test loop: `gleam remove gleeunit && gleam add --dev glacier`
- unused export check: `gleam add --dev cleam`
- benchmark: `gleam add --dev glychee`
- logging config: `gleam add logging`
- live reload DX: `gleam add --dev olive`

External CLI:

- HTTP load test: `k6`

Use compatible combinations of `wisp` and `mist`. Rather than pinning versions individually, it is safer to run `gleam add wisp mist` together and let the solver resolve them at the same time.

Templates:

- `assets/README.md`
- `assets/justfile`
- `assets/github-actions/ci.yml`
- `assets/bench/http.js`
- `assets/test/snapshot_test.gleam`
- `assets/test/property_test.gleam`
- `assets/test/qcheck_parallel_test.gleam`
- `assets/test/timeout_test.gleam`

## gleam.toml Defaults

At minimum, fill these in.

```toml
name = "my_app"
version = "0.1.0"
target = "erlang"
description = "Short package summary"
licences = ["Apache-2.0"]
repository = { type = "github", user = "owner", repo = "repo" }

# Hide modules that are only used inside the package
internal_modules = [
  "my_app/internal",
  "my_app/http/internal",
]
```

Principles:

- Do not leave metadata empty.
- Hide package-internal modules via `internal_modules`.
- Broad semver ranges are acceptable, but always enforce a pinned lockfile in CI.

## Recommended Layout

Start from this split.

```text
src/
  my_app.gleam                # entrypoint
  my_app/app.gleam            # DI and supervision startup
  my_app/web.gleam            # router / request handling
  my_app/domain.gleam         # pure domain logic
  my_app/domain_server.gleam  # actor wrapper
  my_app/http_json.gleam      # encoder / decoder
test/
  my_app_test.gleam
docs/
  reference-ja.md
  reference-en.md
bench/
  main.gleam
justfile
```

Separation criteria:

- `domain.gleam`: pure functions only
- `*_server.gleam`: actor / supervision / timeout / mailbox
- `web.gleam`: routing and HTTP mapping
- `http_json.gleam`: JSON schema and codec
- `app.gleam`: wiring only

Do not mix router, JSON codec, business logic, and actor state in one file.

As it grows, split along these lines.

- `web_*.gleam`: handlers per feature
- `web_json_*.gleam`: encoders / decoders per domain
- `agent_*.gleam`: protocol, runner, tool, transport
- `workspace_*.gleam`: overlay, patch, git, session, runtime
- `*_test_support.gleam`: split test helpers by responsibility

## Wisp + Mist Skeleton

`src/my_app.gleam`

```gleam
import envoy
import gleam/erlang/process
import gleam/int
import gleam/result
import mist
import my_app/app
import my_app/web
import wisp/wisp_mist

const default_port = 4000
const default_secret_key_base =
  "local-dev-secret-key-base-local-dev-secret-key-base-1234567890"

pub fn main() -> Nil {
  let port =
    envoy.get("PORT")
    |> result.map(int.parse)
    |> result.flatten
    |> result.unwrap(default_port)

  let secret_key_base =
    envoy.get("SECRET_KEY_BASE")
    |> result.unwrap(default_secret_key_base)

  let assert Ok(app_state) = app.start()
  let assert Ok(_) =
    web.app(app_state)
    |> wisp_mist.handler(secret_key_base)
    |> mist.new
    |> mist.bind("0.0.0.0")
    |> mist.port(port)
    |> mist.start

  process.sleep_forever()
}
```

`src/my_app/web.gleam`

```gleam
import gleam/http
import my_app/app.{type App}
import wisp

pub fn app(app: App) -> fn(wisp.Request) -> wisp.Response {
  fn(request) {
    case request.method, wisp.path_segments(request) {
      http.Get, ["healthz"] -> wisp.text_response(200, "ok\n")
      _, _ -> wisp.not_found()
    }
  }
}
```

Web-layer principles:

- Read payloads with `wisp.require_json`.
- Return `400` on decoder failure.
- Map domain errors explicitly to `4xx/5xx`.
- Split handlers by feature once they grow.

## OTP Pattern

The basic shape is two layers: `pure state` and `server`.

**Important**: `gleam_otp` is a statically-typed wrapper over Erlang's `gen_server`, and **its API is not compatible with `gen_server`**. Do not call `:gen_server.call` / `:gen_server.cast` directly. Keep everything inside the `Subject` and `actor.Message` world.

### pure state

```gleam
pub opaque type State {
  State(hits: Dict(String, Int), limit: Int)
}

pub fn new(limit: Int) -> State {
  State(hits: dict.new(), limit: limit)
}

pub fn incr(state: State, key: String) -> #(State, Bool) {
  let n = dict.get(state.hits, key) |> result.unwrap(0) + 1
  #(State(..state, hits: dict.insert(state.hits, key, n)), n <= state.limit)
}
```

### actor wrapper (concrete example)

```gleam
import gleam/erlang/process.{type Subject}
import gleam/otp/actor
import gleam/otp/supervision

pub opaque type Message {
  Check(key: String, reply_to: Subject(Bool))
  Reset(key: String)
}

pub opaque type Server { Server(subject: Subject(Message)) }

pub fn start(limit: Int) -> Result(Server, actor.StartError) {
  actor.new(new(limit))
  |> actor.on_message(handle)
  |> actor.start
  |> result.map(fn(started) { Server(subject: started.data) })
}

pub fn supervised(limit: Int) -> supervision.ChildSpecification(Server) {
  supervision.worker(fn() { start(limit) })
}

fn handle(state: State, msg: Message) -> actor.Next(State, Message) {
  case msg {
    Check(key, reply_to) -> {
      let #(next, ok) = incr(state, key)
      process.send(reply_to, ok)
      actor.continue(next)
    }
    Reset(key) ->
      actor.continue(State(..state, hits: dict.delete(state.hits, key)))
  }
}

// sync call pattern: the caller creates a reply subject and passes it in
pub fn check(s: Server, key: String) -> Bool {
  let reply = process.new_subject()
  process.send(s.subject, Check(key, reply))
  process.receive(reply, 1000) |> result.unwrap(False)
}

pub fn reset(s: Server, key: String) -> Nil {
  process.send(s.subject, Reset(key))
}
```

### Three kinds of supervision trees

`gleam_otp` splits supervisors across three modules by use case.

| Kind | Module | When to use |
|---|---|---|
| **static** | `gleam/otp/static_supervisor` | Child processes are fixed at startup (DB pool, pre-configured actors). Handles restarts only. |
| **factory** | `gleam/otp/supervisor_factory` | Spawn the same spec dynamically with IDs (e.g. session-per-user). `start_child(name, arg)` |
| **dynamic** | `gleam/otp/supervisor_dynamic` | Add/remove arbitrary specs dynamically (e.g. job worker pool). `start_child(name, spec)` / `terminate_child` |

The exact API names vary by version. Check the official `gleam_otp` hex docs each time. The template below assumes v0.16+:

```gleam
// src/my_app/app.gleam
import gleam/otp/static_supervisor as sup
import my_app/db_pool
import my_app/rate_limiter

pub fn start() -> Result(Nil, actor.StartError) {
  sup.new(sup.OneForOne)
  |> sup.restart_tolerance(intensity: 3, period: 60)  // allow up to 3 restarts in 60s
  |> sup.add(db_pool.supervised())                    // static child
  |> sup.add(rate_limiter.supervised(limit: 100))     // static child
  |> sup.start
  |> result.replace(Nil)
}
```

How to pick a restart strategy:
- **`Permanent`**: always restart on exit (infrastructure like DB pools or auth servers).
- **`Transient`**: normal exits are fine, restart only on abnormal exits (job workers).
- **`Temporary`**: never restart (one-shot work).

When `restart_intensity` (default 3) over `period` (default 5 seconds) is exceeded, the supervisor itself crashes and propagates upward.

### Guidelines

- Keep `Server` opaque (do not let callers manipulate the Subject directly).
- Do not touch state directly from HTTP (always go through the actor).
- Collect the supervision tree inside `app.gleam`.
- Start with `OneForOne` as the restart strategy, and use `static_supervisor` at the top level.
- Use named actors to make testing easier.
- Use the right supervisor kind for the job: `static` (fixed), `factory` (same spec, dynamic), `dynamic` (arbitrary spec, dynamic).

## JSON Codec (`gleam/dynamic/decode` + `gleam/json`)

Gleam's JSON API tends to shift between versions (`gleam_json` v2+). Current idiomatic usage:

### Decode

```gleam
import gleam/dynamic/decode
import gleam/json

pub type NewTodo { NewTodo(title: String, priority: Int) }

pub fn new_todo_decoder() -> decode.Decoder(NewTodo) {
  use title <- decode.field("title", decode.string)
  use priority <- decode.optional_field("priority", 0, decode.int)
  decode.success(NewTodo(title:, priority:))
}

// Inside a Wisp handler
case decode.run(body, new_todo_decoder()) {
  Ok(nt) -> // ... use nt
  Error(errors) -> wisp.bad_request("invalid json: " <> string.inspect(errors))
}
```

`decode.field` is required; `decode.optional_field(key, default, decoder)` is optional. For nested objects use `decode.field("user", user_decoder())`.

### Encode

```gleam
pub fn encode_todo(t: Todo) -> json.Json {
  json.object([
    #("id", json.int(t.id)),
    #("title", json.string(t.title)),
    #("done", json.bool(t.done)),
  ])
}

// Return it from Wisp
wisp.json_response(json.to_string_tree(encode_todo(t)), 201)
```

Lists: `json.array(items, of: encode_todo)`.

**LSP Code Action**: `gleam-language-server` v1.2+ ships a "Generate JSON encoder/decoder" feature. Place the cursor on the `Todo` type and invoke the Code Action to auto-generate `encode_todo` / `todo_decoder`. More accurate than writing them by hand.

## justfile Template

For reuse, first copy `assets/justfile` into the project root, then tweak.

```just
set shell := ["bash", "-cu"]

default:
  @just --list

deps:
  gleam deps download

format:
  gleam format

format-check:
  gleam format --check .

typecheck:
  gleam check

build:
  gleam build --warnings-as-errors

test:
  gleam test

run:
  gleam run

docs:
  gleam docs build

check:
  gleam format --check .
  gleam check
  gleam build --warnings-as-errors
  gleam test

ci: deps check

clean:
  gleam clean

bench *args:
  gleam run -m bench/main -- {{args}}
```

Policies:

- Shell is `bash`.
- The CI entrypoint is `just ci`.
- Do not create a dedicated `lint` command; cover it with `format-check + build --warnings-as-errors`.

Add these if needed.

- `exports: gleam run -m cleam`
- `snapshot-review: gleam run -m birdie`
- `test-watch: gleam test -- --glacier`
- `bench-http: k6 run bench/http.js`
- `serve-dev: gleam run -m olive`

## CI Workflow Template

If you use GitHub Actions, first copy `assets/github-actions/ci.yml` to `.github/workflows/ci.yml` and only add project-specific steps on top.

Principles:

- Make `just ci` the single entrypoint for both CI and local.
- Pin Erlang / Gleam versions on the workflow side.
- Add extra toolchains only when you have `@external`, NIF, Wasm, or Elixir dependencies.
- Do not pile shell scripts into the workflow; push logic down into the `justfile`.

## Testing

Lock down pure functions first, then actors, then finally HTTP.

`test/my_app_test.gleam`

```gleam
import gleam/http
import gleeunit
import my_app/app
import my_app/web
import wisp/simulate

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn healthz_test() {
  let assert Ok(app_state) = app.start()
  let response = web.app(app_state)(simulate.request(http.Get, "/healthz"))

  assert response.status == 200
  assert simulate.read_body(response) == "ok\n"
}
```

Testing policy:

- Test state transitions of pure modules directly.
- For actor modules, test only the public API.
- Prefer `wisp/simulate` for HTTP tests.
- Inject fake services for external APIs.
- Use poll/retry helpers instead of flaky sleeps.
- Use `birdie` for outputs where snapshots fit.
- Use `qcheck` for pure logic where property-based tests fit.
- Use `glacier` when you want faster local iteration.

Basic `birdie` workflow:

1. `gleam test`
2. Check failing / new snapshots.
3. `gleam run -m birdie`
4. Review snapshots and commit.

Basic `qcheck` workflow:

1. Pick one property of a pure function.
2. Feed it generators through `qcheck.given(...)`.
3. When a counterexample appears, use the shrunk result to write a unit test.
4. For long-running tests or parallel execution, use `qcheck_gleeunit_utils`.

Notes on `qcheck_gleeunit_utils`:

- Erlang-target only.
- To parallelize all tests together, use `run.run_gleeunit`.
- To wrap only one long test, use `test_spec.make`.
- To attach a custom timeout, use `test_spec.make_with_timeout`.
- To make test groups explicit, use `test_spec.run_in_parallel` / `run_in_order`.

## Test Structure

Once features grow, split test files by responsibility.

- `domain_test.gleam`: pure domain logic
- `runtime_test.gleam` / `app_test.gleam`: supervision and actor integration
- `web_app_test.gleam`: HTTP contract
- `agent_test.gleam`: external API orchestration
- `workspace_session_server_test.gleam`: server / state helpers
- `workspace_bit_runtime_test.gleam`: FFI / git / wasm integration
- `workspace_session_http_test.gleam`: session API contract

Split the support modules too.

- `*_app_test_support.gleam`: app startup, handler construction, runtime helpers
- `*_workspace_test_support.gleam`: fixture directories, workspace helpers

Do not cram everything into a single giant test file. As refactoring proceeds, split the tests along with it.

## Lint and Quality

Gleam fits better with strict use of the formatter and compiler warnings than with a separate first-party lint tool.

Minimum:

- `gleam format --check .`
- `gleam check`
- `gleam build --warnings-as-errors`
- `gleam test`

Supplementary:

- Track deprecated APIs: `gleam fix`
- Check docs: `gleam docs build`
- Detect unused exports: `gleam run -m cleam`

## Performance Measurement

Measure in three tiers.

1. Micro benchmarks of pure functions.
2. Integration benchmarks for actors / workspaces.
3. Load tests against HTTP endpoints.

Principles:

- Separate pure functions from I/O as benchmark targets.
- Separate warmup from measurement.
- Turn off debug logging.
- Run `gleam clean` and pre-download dependencies before benchmarking.
- Do not compare micro benchmark numbers against HTTP load-test numbers on equal footing.
- For FFI / Wasm / Ports, measure cold start and hot path separately.

Tools:

- Micro benchmarks: create a `bench/` module and run it with `gleam run -m bench/main`.
- If you want a library, use `glychee`.
- HTTP load tests: `k6` or `wrk`.
- BEAM hotspots: from `erl` / `gleam shell`, use `:eprof`, `:fprof`, `:erlang.statistics(:reductions)`.

Minimal HTTP measurement example:

```sh
just run
k6 run bench/http.js
```

Start by copying `assets/bench/http.js` to `bench/http.js`.

## FFI and Native Integration

When you use `@external`, stick to these rules.

- Create a single adapter module.
- Expose only `pub opaque type Handle`.
- Do not leak too many Erlang/Elixir types or pids.
- Keep the details of paths, ETS, NIF, Port, and Wasm runtimes inside internal modules.
- Write both live tests and failure tests.

The compiler does not validate `@external` implementations, so minimize the Gleam-side surface area.

## Additional Tools

Think of frequently used external tools as follows.

- `gleeunit`: the default unit test runner. Start here.
- `birdie`: snapshot tests. Good for pinning HTTP responses and generated text.
- `qcheck` + `qcheck_gleeunit_utils`: property-based testing. Good for pure domain logic.
- `glacier`: interactive / incremental test loop. Use as a drop-in replacement for `gleeunit`.
- `cleam`: detect unused exports. Good for pruning the public API.
- `glychee`: micro benchmarks. Good for comparing pure functions and small integrations.
- `k6`: HTTP / WebSocket load testing. An external CLI, not a Gleam package.
- `logging`: configuration for Erlang's logger. Reasonable to add for ops-heavy projects.
- `olive`: dev proxy with live reload. Only bother when you want to improve the Wisp/Mist dev experience.

Selection:

- Default: `gleam format/check/build/test`.
- First additions worth considering: `birdie`, `qcheck`, `cleam`, `glychee`.
- `glacier` and `olive`: when you want to improve local DX.
- `logging`: for long-running services or production apps.

## Documentation

The README should at least cover:

- What is implemented and what is explicitly out of scope.
- The main module prefixes and their responsibilities.
- How to start, `just ci`, and the main endpoints.
- How to read the test files.

For mid-sized or larger projects, add a `docs/` directory and guide readers through it.

- `docs/reference-ja.md`: Japanese implementation guide.
- `docs/reference-en.md`: English implementation guide.

State clearly at the top of the README whether this project is "introductory" or a "practical reference implementation".

## Reference Project Positioning

When presenting a Gleam project as a reference implementation, do not leave its positioning vague.

- beginner sample: a small API with minimal OTP.
- medium reference: `wisp + mist + gleam_otp + just + CI + docs`.
- advanced integration: FFI, Wasm, external LLM, workspace/session orchestration.

When you include advanced material, explain separately whether each part is "standard Gleam style" or "complexity specific to this project".

## Closure Checklist

Good checkpoints for calling a cut "done":

- The public / internal boundary is organized.
- `just ci` is green.
- Test files are split per feature.
- Support modules are split by responsibility.
- The README covers implementation status and test layout.
- If needed, `docs/` contains a reference guide.

## Review Checklist

- Are the public constructors truly necessary?
- Could `pub type` be made `pub opaque type`?
- Are there modules that should be hidden in `internal_modules`?
- Is the web layer doing more than decode/call/encode?
- Is pure logic mixed with actor state?
- Is `just ci` the shared entrypoint for local and CI?
- Is `gleam build --warnings-as-errors` passing?
- Are you baking in absolute paths or machine-local config?
- Is the external/FFI boundary too wide?

## References

- Gleam docs: https://gleam.run/
- Gleam `gleam.toml`: https://gleam.run/writing-gleam/gleam-toml/
- Gleam externals: https://gleam.run/documentation/externals/
- Gleam CLI: https://gleam.run/reference/cli/
- Wisp docs: https://hexdocs.pm/wisp/
- Mist docs: https://hexdocs.pm/mist/
- just manual: https://just.systems/man/en/
