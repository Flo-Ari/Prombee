/** Start Vite and the loopback API together; stop both on Ctrl+C. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const candidates =
  process.platform === "win32"
    ? [".venv/Scripts/python.exe", "work/build-venv/Scripts/python.exe"]
    : [".venv/bin/python", "work/build-venv/bin/python"];
const python =
  process.env.PROMBEE_PYTHON ||
  candidates.find(existsSync) ||
  (process.platform === "win32" ? "python" : "python3");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGINT");
  process.exitCode = code;
}
for (const [command, args] of [
  [python, ["dev.py"]],
  [process.execPath, [resolve("node_modules/vite/bin/vite.js")]],
]) {
  const child = spawn(command, args, { stdio: "inherit" });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
