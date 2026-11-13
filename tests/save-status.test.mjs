import test from "node:test";
import assert from "node:assert/strict";
import { mountSaveStatus } from "../web/save-status.js";
test("explicit save receipt expires in five seconds; new edits and newer errors are never cleared by its old timer", () => {
  const root = { textContent: "" };
  let callback,
    delay,
    cleared = 0;
  const status = mountSaveStatus(root, {
    setTimer: (fn, ms) => {
      callback = fn;
      delay = ms;
      return 1;
    },
    clearTimer: () => cleared++,
  });
  assert.equal(root.textContent, "");
  status.success();
  assert.equal(delay, 5000);
  assert.match(root.textContent, /已保存/);
  callback();
  assert.equal(root.textContent, "");
  status.success();
  status.dismiss();
  assert.equal(root.textContent, "");
  assert.equal(cleared, 1);
  status.success();
  root.textContent = "保存失败";
  callback();
  assert.equal(root.textContent, "保存失败");
});
