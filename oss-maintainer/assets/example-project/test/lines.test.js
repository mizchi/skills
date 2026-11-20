import { expect, test } from "vite-plus/test";
import { lines } from "../src/index.js";

test("splits Unix and Windows lines and preserves blank lines", () => {
  expect(lines("one\r\n\ntwo")).toEqual(["one", "", "two"]);
});
