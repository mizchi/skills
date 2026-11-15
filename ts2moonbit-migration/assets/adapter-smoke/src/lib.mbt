///|
pub fn dynamic_read() -> Int32 {
  let obj = @core.new_object()
  obj._set("value", @core.any(42))
  obj._get("value").cast()
}

///|
async fn double_impl(value : Int32) -> Int32 {
  @core.sleep(1)
  value * 2
}

///|
pub fn double_async(value : Int32) -> @core.Promise[Int32] {
  (@core.promisify1(double_impl))(value)
}
