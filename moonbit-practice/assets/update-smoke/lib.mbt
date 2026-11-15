///|
#derive(Debug, Eq, @json.ToJson)
pub(all) struct Point {
  x : Int32
  y : Int32
}

///|
pub extend Point with @debug.Debug::{to_repr}

///|
pub extend Point with Eq::{equal, not_equal}

///|
pub extend Point with @json.ToJson::{to_json}

///|
pub fn request_path(line : Bytes) -> BytesView? {
  if line =~ (reb"^GET " + (reb"[^ ]+" as path), after=_) {
    Some(path)
  } else {
    None
  }
}
