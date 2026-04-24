import gleam/list
import gleeunit/should
import qcheck
import qcheck_gleeunit_utils/run
import qcheck_gleeunit_utils/test_spec

pub fn main() -> Nil {
  run.run_gleeunit()
}

pub fn addition_commutes__test() {
  use left, right <- qcheck.map2(
    qcheck.small_non_negative_int(),
    qcheck.small_non_negative_int(),
  )

  assert left + right == right + left
}

pub fn long_running_properties__test_() {
  [sum_is_non_negative, sum_is_greater_than_each_term]
  |> list.map(test_spec.make)
  |> test_spec.run_in_parallel
}

fn sum_is_non_negative() {
  use left, right <- qcheck.map2(
    qcheck.small_non_negative_int(),
    qcheck.small_non_negative_int(),
  )

  assert left + right >= 0
}

fn sum_is_greater_than_each_term() {
  use left, right <- qcheck.map2(
    qcheck.small_non_negative_int(),
    qcheck.small_non_negative_int(),
  )

  should.equal(True, left + right >= left && left + right >= right)
}
