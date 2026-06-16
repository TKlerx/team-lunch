import { execFileSync } from "node:child_process";
import path from "node:path";

const maxLines = 300;

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

function printReport(violations) {
  console.log(`Function size cap: ${maxLines} lines for non-test source code`);

  if (violations.length > 0) {
    console.error("\nFunction size gate failed:");
    for (const item of violations) {
      const name = item.name ?? "<anonymous>";
      console.error(`  ${item.lines}/${maxLines}  ${item.file}:${item.line}  ${name}`);
    }
  }
}

const violations = collectOversizedFunctions(runEslint());
printReport(violations);

if (violations.length > 0) {
  process.exit(1);
}

