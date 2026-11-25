/** Start Vite and the loopback API together; stop both on Ctrl+C. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const frontend = resolve(root, "frontend");
const candidates =
  process.platform === "win32"
    ? [".venv/Scripts/python.exe", ".cache/prombee/build-venv/Scripts/python.exe"]
    : [".venv/bin/python", ".cache/prombee/build-venv/bin/python"];
const python =
  process.env.PROMBEE_PYTHON ||
  candidates.map((path) => resolve(root, path)).find(existsSync) ||
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
  [python, [resolve(root, "backend/prombee/preview.py")]],
  [process.execPath, [resolve(frontend, "node_modules/vite/bin/vite.js")]],
]) {
  const child = spawn(command, args, { stdio: "inherit", cwd: frontend });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
