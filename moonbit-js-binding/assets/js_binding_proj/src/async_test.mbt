///|
async test "sleep then continue" {
  @js_binding_proj.sleep(5)
  inspect("awoke", content="awoke")
}

///|
async test "resolve_later returns the value" {
  let v = @js_binding_proj.resolve_later(42, 1)
  inspect(v, content="42")
}

///|
async test "Promise.all converts internal arrays and preserves order" {
  let promises : Array[@js_binding_proj.Promise[Int32]] = [
    ffi_resolve_for_test(10, 5),
    ffi_resolve_for_test(20, 1),
  ]
  let values = @js_binding_proj.Promise::all(promises).wait()
  assert_eq(values.length(), 2)
  assert_eq(values[0], 10)
  assert_eq(values[1], 20)
}

///|
async test "Promise.all accepts an empty internal array" {
  let promises : Array[@js_binding_proj.Promise[Int32]] = []
  let values = @js_binding_proj.Promise::all(promises).wait()
  assert_eq(values.length(), 0)
}

///|
extern "js" fn ffi_resolve_for_test(
  value : Int32,
  ms : Int32,
) -> @js_binding_proj.Promise[Int32] =
  #| (value, ms) => new Promise(resolve => setTimeout(() => resolve(value), ms))

///|
async fn wait_operation(should_fail : Bool) -> Int32 {
  if should_fail {
    fail("ordinary error")
  }
  @async.sleep(10000)
  42
}

///|
async test "cancellation bypasses catch and triggers errdefer" {
  let events : Array[String] = []
  @async.with_timeout_opt(1, async fn() {
    let result = @async.handle_cancellation(async fn() {
      errdefer events.push("cleanup")
      wait_operation(false) catch {
        _ => {
          events.push("caught")
          -1
        }
      }
    })
    assert_true(result is None)
    assert_true(@async.is_being_cancelled())
    @async.protect_from_cancel(async fn() {
      @async.pause()
      events.push("protected")
    })
  })
  |> ignore
  debug_inspect(events, content="[\"cleanup\", \"protected\"]")
}
