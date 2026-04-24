import birdie
import gleeunit

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn greeting_snapshot_test() {
  render_greeting("Gleam")
  |> birdie.snap(title: "render greeting")
}

fn render_greeting(name: String) -> String {
  "<h1>Hello, " <> name <> "!</h1>\n"
}
