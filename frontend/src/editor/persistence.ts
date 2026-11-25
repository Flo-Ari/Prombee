/** Normal saves must not use keepalive: its in-flight body quota is only 64 KiB. */
export class SaveError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "SaveError";
  }
}

export async function saveWorkspace(payload: string, request = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await request("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal,
    });
    let value;
    try {
      value = await response.json();
    } catch {
      throw new SaveError(
        `保存服务返回了无效响应（HTTP ${response.status}）`,
        response.status,
      );
    }
    if (!response.ok)
      throw new SaveError(
        value.error || `保存请求失败（HTTP ${response.status}）`,
        response.status,
      );
    if (!Number.isInteger(value.revision) || value.revision < 0)
      throw new SaveError("保存服务未确认文件版本，请重试");
    return value;
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError(
      controller.signal.aborted
        ? "保存服务响应超时，当前内容仍保留在编辑器中"
        : `无法连接本机保存服务：${error.message || "连接中断"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
