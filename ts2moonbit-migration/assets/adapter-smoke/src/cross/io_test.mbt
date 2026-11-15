///|
async test "filesystem data and subprocess contract" {
  @async.sleep(1)
  let dir = @fs.tmpdir(prefix="skill_adapter_")
  let path = dir + "/value.txt"
  @fs.write_file(path, "adapter-value")
  assert_true(@fs.exists(path))
  let data = @fs.read_file(path)
  assert_eq(data.text(), "adapter-value")
  let (code, stdout) = @process.collect_stdout("node", [
    "-e", "process.stdout.write('adapter-child')",
  ])
  assert_eq(code, 0)
  assert_eq(stdout.text(), "adapter-child")
  @fs.remove(path)
  @fs.rmdir(dir)
}
