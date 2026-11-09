export function appName(language) {
  return String(language || "")
    .toLowerCase()
    .startsWith("zh")
    ? "提示蜂"
    : "Prombee";
}
const params = new URLSearchParams(globalThis.location?.search || "");
const language =
  params.get("lang") ||
  globalThis.navigator?.languages?.[0] ||
  globalThis.navigator?.language ||
  "en";
export const productName = appName(language);
export function applyBranding(root = document) {
  root.title = productName;
  for (const element of root.querySelectorAll("[data-app-name]"))
    element.textContent = productName;
}
if (typeof document !== "undefined") applyBranding();
