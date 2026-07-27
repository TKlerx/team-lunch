import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const ignoredGhsas = new Set(
  [...workspace.matchAll(/^\s*-\s*(GHSA-[\w-]+)\s*$/gm)].map((match) => match[1]),
);
if (!process.env.npm_execpath) {
  throw new Error("Run this check through pnpm so npm_execpath is available.");
}

const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--prod", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (result.error) throw result.error;

const audit = JSON.parse(result.stdout);
const unapproved = Object.values(audit.advisories ?? {}).filter(
  (advisory) => !ignoredGhsas.has(advisory.github_advisory_id),
);

if (unapproved.length > 0) {
  console.error(JSON.stringify({ advisories: unapproved }, null, 2));
  process.exit(1);
}

console.log(`Production dependency audit passed (${ignoredGhsas.size} approved exceptions).`);
