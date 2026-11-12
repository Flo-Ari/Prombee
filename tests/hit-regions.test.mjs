import test from "node:test";
import assert from "node:assert/strict";
import { alphaRegions } from "../web/hit-regions.js";
test("alpha mask leaves transparent holes clickable through and coalesces equal adjacent runs", () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [3, 2],
  ])
    data[(y * 4 + x) * 4 + 3] = 255;
  assert.deepEqual(alphaRegions(data, 4, 4, 1), [
    [0, 0, 2, 2],
    [3, 2, 1, 1],
  ]);
  assert.deepEqual(alphaRegions(new Uint8ClampedArray(16), 2, 2), []);
});
