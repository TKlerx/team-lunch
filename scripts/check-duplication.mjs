import { spawnSync } from "node:child_process";
import path from "node:path";

const bypassThresholds = process.env.QUALITY_THRESHOLDS_BYPASS === "1";
const jscpdBin = path.join(
  process.cwd(),
  "node_modules",
  "jscpd",
  "dist",
  "bin",
  "jscpd.js",
);

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
