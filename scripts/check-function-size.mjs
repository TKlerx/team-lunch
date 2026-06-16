import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const allowlistPath = path.resolve("function-size-allowlist.json");
const config = JSON.parse(readFileSync(allowlistPath, "utf8"));
const maxLines = config.maxLines;
const allowlist = new Map(
  config.allowed.map((entry) => [`${entry.file}#${entry.name}`, entry]),
);

function runEslint() {
  const eslintBin = path.resolve("node_modules/eslint/bin/eslint.js");
  const output = execFileSync(
    process.execPath,
    [eslintBin, "src/**/*.{ts,tsx}", "--format", "json"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output);
}

function parseFunctionName(message) {
  const namedMatch = message.match(/(?:Async function|Function) '([^']+)'/);
  if (namedMatch) {
    return namedMatch[1];
  }
  return null;
}

function parseLineCount(message) {
  const match = message.match(/has too many lines \((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

function collectOversizedFunctions(report) {
  const oversized = [];
  for (const file of report) {
    const relativePath = path.relative(process.cwd(), file.filePath).replaceAll(path.sep, "/");
    for (const message of file.messages) {
      if (message.ruleId !== "max-lines-per-function") {
        continue;
      }

      const lines = parseLineCount(message.message);
      if (lines <= maxLines) {
        continue;
      }

      oversized.push({
        file: relativePath,
        line: message.line,
        name: parseFunctionName(message.message),
        lines,
        message: message.message,
      });
    }
  }

  return oversized.sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
}

function classify(functions) {
  const allowed = [];
  const violations = [];
  for (const item of functions) {
    const key = item.name ? `${item.file}#${item.name}` : null;
    const allowlisted = key ? allowlist.get(key) : null;
    if (allowlisted && item.lines <= allowlisted.maxAllowedLines) {
      allowed.push({ ...item, maxAllowedLines: allowlisted.maxAllowedLines });
      continue;
    }

    violations.push({ ...item, maxAllowedLines: allowlisted?.maxAllowedLines ?? maxLines });
  }

  return { allowed, violations };
}

function printReport(allowed, violations) {
  console.log(`Function size cap: ${maxLines} lines for non-test source code`);
  console.log(`Allowlisted oversized functions: ${allowed.length}`);

  if (allowed.length > 0) {
    console.log("\nBurn-down list:");
    for (const item of allowed) {
      console.log(`  ${item.lines}/${item.maxAllowedLines}  ${item.file}:${item.line}  ${item.name}`);
    }
  }

  if (violations.length > 0) {
    console.error("\nFunction size gate failed:");
    for (const item of violations) {
      const name = item.name ?? "<anonymous>";
      const ceiling = item.maxAllowedLines === maxLines ? maxLines : item.maxAllowedLines;
      console.error(`  ${item.lines}/${ceiling}  ${item.file}:${item.line}  ${name}`);
    }
  }
}

const { allowed, violations } = classify(collectOversizedFunctions(runEslint()));
printReport(allowed, violations);

if (violations.length > 0) {
  process.exit(1);
}

