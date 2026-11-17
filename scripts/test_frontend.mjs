import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
