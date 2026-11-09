export function bindSpeech({
  button,
  capture,
  commit,
  notify,
  request = fetch,
  Recognition = globalThis.window?.SpeechRecognition ||
    globalThis.window?.webkitSpeechRecognition,
}) {
  let recognition,
    target,
    transcript = "",
    running = false,
    system = false,
    busy = false,
    stopping = false;
  const paint = (value) => {
    running = value;
    button.textContent = value ? "停止听写" : "语音输入";
    button.setAttribute("aria-pressed", String(value));
  };
  const action = async (name) => {
    const response = await request("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name }),
    });
    if (!response.ok) throw new Error();
    return response.json();
  };
  const finish = () => {
    if (transcript && target) commit(target, transcript);
    transcript = "";
    target = null;
    recognition = null;
    if (!system) paint(false);
  };
  const fallback = async () => {
    if (stopping || system) return;
    system = true;
    target?.focus?.();
    try {
      const value = await action("start");
      if (value.state !== "listening") throw new Error();
      paint(true);
    } catch {
      system = false;
      finish();
      notify("语音输入不可用");
    }
  };
  button.onmousedown = (event) => event.preventDefault();
  button.onclick = async () => {
    if (busy) return;
    if (running) {
      await stop();
      return;
    }
    target = capture();
    if (!target) {
      notify("请选择条目");
      return;
    }
    busy = true;
    stopping = false;
    transcript = "";
    try {
      if (!Recognition) {
        await fallback();
        return;
      }
      recognition = new Recognition();
      recognition.lang = globalThis.navigator?.language?.startsWith("zh")
        ? "zh-CN"
        : globalThis.navigator?.language || "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index++
        )
          if (event.results[index].isFinal)
            transcript += event.results[index][0].transcript;
      };
      recognition.onerror = (event) => {
        if (
          ["network", "service-not-allowed", "language-not-supported"].includes(
            event.error,
          )
        ) {
          const destination = target;
          finish();
          target = destination;
          fallback();
        } else {
          finish();
          if (event.error !== "aborted")
            notify(
              event.error === "not-allowed" ? "麦克风未授权" : "未识别到语音",
            );
        }
      };
      recognition.onend = () => {
        if (!system) finish();
      };
      recognition.start();
      paint(true);
    } catch {
      await fallback();
    } finally {
      busy = false;
    }
  };
  async function stop() {
    stopping = true;
    if (system) {
      try {
        await action("stop");
      } catch {}
      system = false;
      finish();
      paint(false);
    } else if (recognition) {
      recognition.stop();
      for (let attempt = 0; recognition && attempt < 30; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (recognition) {
        recognition.abort();
        finish();
      }
    }
  }
  return { stop };
}
