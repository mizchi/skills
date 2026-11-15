///|
test "errdefer cleans failed acquisition and preserves successful ownership" {
  let events : Array[String] = []
  assert_eq(acquire_for_test(events, false), 7)
  assert_eq(events.length(), 0)
  let failed = acquire_for_test(events, true) catch { _ => -1 }
  assert_eq(failed, -1)
  debug_inspect(events, content="[\"cleanup\"]")
}

///|
test "cleanup errors replace the pending error and remaining defers still run" {
  let events : Array[String] = []
  let kind = replace_error_for_test(events) catch {
    FixtureError::Cleanup => 2
    _ => 1
  }
  assert_eq(kind, 2)
  debug_inspect(events, content="[\"replacement\", \"last\"]")
}

///|
test "suberror type patterns narrow Error without enumerating constructors" {
  assert_eq(error_kind_for_test(FixtureError::Operation), 1)
  assert_eq(error_kind_for_test(FixtureError::Cleanup), 2)
}

///|
test "for patterns and labelled blocks preserve early exit" {
  assert_eq(weighted_until_stop([(2, 3), (4, 5), (-1, 100), (9, 9)]), 26)
}

///|
test "lexscan maintains its cursor while lexmatch handles a whole value" {
  let scanner = @lexbuf.StringScanner("alpha beta")
  assert_true(scan_word(scanner) is Some("alpha"))
  assert_eq(scanner.cursor, 5)
  assert_true(scan_word(scanner) is Some("beta"))
  assert_eq(scanner.cursor, 10)
  assert_true(scan_word(scanner) is None)
  assert_true(whole_word("alpha") is Some("alpha"))
  assert_true(whole_word("alpha beta") is None)
}

///|
test "external non-exhaustive enum matches preserve the future-constructor arm" {
  assert_eq(status_label(@variants.Ready), "ready")
  assert_eq(status_label(@variants.Waiting), "waiting")
}

///|
suberror FixtureError {
  Operation
  Cleanup
}

///|
fn acquire_for_test(
  events : Array[String],
  should_fail : Bool,
) -> Int32 raise FixtureError {
  errdefer events.push("cleanup")
  if should_fail {
    raise FixtureError::Operation
  }
  7
}

///|
fn replace_error_for_test(events : Array[String]) -> Int32 raise FixtureError {
  defer events.push("last")
  errdefer {
    events.push("replacement")
    raise FixtureError::Cleanup
  }
  raise FixtureError::Operation
}

///|
fn error_kind_for_test(error : Error) -> Int32 {
  match error {
    FixtureError::_ as narrowed => fixture_error_code(narrowed)
    _ => 0
  }
}

///|
fn fixture_error_code(error : FixtureError) -> Int32 {
  match error {
    Operation => 1
    Cleanup => 2
  }
}

///|
fn weighted_until_stop(items : Array[(Int32, Int32)]) -> Int32 {
  done~: {
    let mut total = 0
    for (value, weight) in items {
      if value < 0 {
        break done~ total
      }
      total += value * weight
    }
    total
  }
}

///|
fn scan_word(scanner : @lexbuf.StringScanner) -> String? {
  lexscan scanner {
    re"^[ ]+" => scan_word(scanner)
    re"^[A-Za-z]+" as word => Some(word.to_owned())
    _ => None
  }
}

///|
fn whole_word(text : StringView) -> String? {
  lexmatch text {
    re"^[A-Za-z]+$" as word => Some(word.to_owned())
    _ => None
  }
}

///|
fn status_label(status : @variants.Status) -> String {
  match status {
    Ready => "ready"
    Waiting => "waiting"
    @variants.Status::.. => "future"
  }
}
