// Automatic persistence stays quiet; only explicit saves display a timed receipt.
export function mountSaveStatus(
  root,
  { setTimer = setTimeout, clearTimer = clearTimeout, duration = 5000 } = {},
) {
  let timer = null,
    message = "";
  function dismiss() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (root.textContent === message) root.textContent = "";
    message = "";
  }
  return {
    dismiss,
    success(text = "已保存到本机") {
      dismiss();
      message = text;
      root.textContent = text;
      timer = setTimer(() => {
        if (root.textContent === message) root.textContent = "";
        timer = null;
        message = "";
      }, duration);
    },
  };
}
