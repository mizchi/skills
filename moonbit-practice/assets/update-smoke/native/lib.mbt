///|
let offset : Int32 = 2

///|
#export_name("skill_add")
pub fn add(a : Int32, b : Int32) -> Int32 {
  a + b + offset
}
