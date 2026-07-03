import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jscpdBin = require.resolve("jscpd/run-jscpd.js");
const bypassThresholds = process.env.QUALITY_THRESHOLDS_BYPASS === "1";
const args = ["src/", "--config", ".jscpd.json"];

if (bypassThresholds) {
  console.warn(
    "QUALITY_THRESHOLDS_BYPASS=1: duplication threshold is running in advisory mode.",
  );
  args.push("--threshold", "100");
}

console.log(`> jscpd ${args.join(" ")}`);
const result = spawnSync(process.execPath, [jscpdBin, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
