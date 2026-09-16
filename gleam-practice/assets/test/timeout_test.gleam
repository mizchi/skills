import gleam/list
import gleeunit
import qcheck_gleeunit_utils/test_spec

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn slow_integration__test_() {
  test_spec.make_with_timeout(10, fn() {
    let values = build_large_fixture(20_000)
    assert list.length(values) == 20_000
  })
}

fn build_large_fixture(size: Int) -> List(Int) {
  build_large_fixture_loop(size, [])
}

fn build_large_fixture_loop(remaining: Int, acc: List(Int)) -> List(Int) {
  case remaining <= 0 {
    True -> acc
    False -> build_large_fixture_loop(remaining - 1, [remaining, ..acc])
  }
}
