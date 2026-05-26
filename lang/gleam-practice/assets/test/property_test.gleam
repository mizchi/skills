import gleeunit
import qcheck

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn addition_commutes_property_test() {
  use left, right <- qcheck.map2(
    qcheck.small_non_negative_int(),
    qcheck.small_non_negative_int(),
  )

  assert left + right == right + left
}
