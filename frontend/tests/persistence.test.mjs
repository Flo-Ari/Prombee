import test from "node:test";
import assert from "node:assert/strict";
import { saveWorkspace, SaveError } from "../src/editor/persistence.ts";

test("large workspace saves use normal requests without the keepalive quota", async () => {
  const payload = JSON.stringify({ text: "中文提示词".repeat(20000) });
  assert.ok(Buffer.byteLength(payload) > 65536);
  const result = await saveWorkspace(payload, async (url, options) => {
    assert.equal(url, "/api/state");
    assert.equal(options.method, "PUT");
    assert.equal(options.keepalive, undefined);
    assert.equal(options.body, payload);
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true,
      json: async () => ({ revision: 8, fingerprint: "written" }),
    };
  });
  assert.equal(result.revision, 8);
});

test("save errors retain server reasons and distinguish conflicts", async () => {
  for (const status of [400, 409, 500]) {
    await assert.rejects(
      saveWorkspace("{}", async () => ({
        ok: false,
        status,
        json: async () => ({ error: "磁盘空间不足" }),
      })),
      (error) =>
        error instanceof SaveError &&
        error.status === status &&
        error.message === "磁盘空间不足",
    );
  }
  await assert.rejects(
    saveWorkspace("{}", async () => {
      throw new TypeError("Failed to fetch");
    }),
    /无法连接本机保存服务/,
  );
  await assert.rejects(
    saveWorkspace("{}", async () => ({ ok: true, json: async () => ({}) })),
    /未确认文件版本/,
  );
});
