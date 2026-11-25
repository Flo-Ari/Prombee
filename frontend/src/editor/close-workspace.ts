/** Closing is bounded even when saving, speech shutdown or recovery fails. */
export async function finishClose({
  save,
  preserve,
  notify,
  timeoutMs = 4000,
}) {
  let timer;
  let result = "saved";
  try {
    await Promise.race([
      Promise.resolve().then(save),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("关闭时保存超时")),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    result = "error";
    try {
      await preserve(error.message || "关闭时保存失败");
    } catch {}
  } finally {
    clearTimeout(timer);
    notify(result);
  }
}
