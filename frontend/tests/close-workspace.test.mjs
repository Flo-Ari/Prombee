import test from "node:test";
import assert from "node:assert/strict";
import { finishClose } from "../src/editor/close-workspace.ts";

test("close waits for a successful save before notifying native host", async () => {
  const calls = [];
  await finishClose({
    save: async () => {
      calls.push("saved");
    },
    preserve: () => assert.fail("unnecessary recovery"),
    notify: (status) => calls.push(status),
  });
  assert.deepEqual(calls, ["saved", "saved"]);
});
test("close preserves recovery and still exits after a failed save or backup", async () => {
  for (const backupFails of [false, true]) {
    const calls = [];
    await finishClose({
      save: async () => {
        throw Error("文件被外部修改");
      },
      preserve: async (reason) => {
        calls.push(reason);
        if (backupFails) throw Error("磁盘已满");
      },
      notify: (status) => calls.push(status),
    });
    assert.deepEqual(calls, ["文件被外部修改", "error"]);
  }
});
test("an unresponsive save cannot prevent closing", async () => {
  const calls = [];
  await finishClose({
    save: () => new Promise(() => {}),
    preserve: async (reason) => calls.push(reason),
    notify: (status) => calls.push(status),
    timeoutMs: 10,
  });
  assert.deepEqual(calls, ["关闭时保存超时", "error"]);
});
