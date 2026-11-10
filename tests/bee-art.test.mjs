import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  BEE_SOURCE,
  SOURCE_SCALE,
  sourcePoint,
  articulatedMouth,
  MOUTH_TIP,
} from "../web/bee-art.js";
test("reference bitmap stays unchanged and pinned anatomy follows its original geometry", async () => {
  const raw = await readFile(new URL("../web/" + BEE_SOURCE, import.meta.url));
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    "68640b64c4ca0f47893eff0ddb45546a72baa29972a5467f6eb25bb6531ee3cf",
  );
  assert.ok(Math.abs(sourcePoint(350, 560).x - 31) < 1e-8);
  assert.ok(Math.abs(sourcePoint(350, 560).y + 6) < 1e-8);
  assert.deepEqual(articulatedMouth(0), MOUTH_TIP);
  assert.equal(SOURCE_SCALE, 0.18);
});
