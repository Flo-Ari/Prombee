import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const tests = readdirSync("tests")
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => "tests/" + file);
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...tests],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
