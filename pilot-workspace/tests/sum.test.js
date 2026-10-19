import test from "node:test";
import assert from "node:assert/strict";
import { sum } from "../src/sum.js";

test("iki sayıyı toplar", () => {
  assert.equal(sum(2, 3), 5);
});
