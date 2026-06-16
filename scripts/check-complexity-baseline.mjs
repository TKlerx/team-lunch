import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const baselinePath = path.resolve('complexity-baseline.json');
const update = process.argv.includes('--update');
const rules = [
  'complexity',
  'max-depth',
  'max-lines-per-function',
  'max-params',
  'sonarjs/cognitive-complexity',
];

function runEslint() {
  const eslintBin = path.resolve('node_modules/eslint/bin/eslint.js');
  const output = execFileSync(
    process.execPath,
    [eslintBin, 'src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '--format', 'json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(output);
}

function metricValue(message) {
  const matches = [...message.matchAll(/\b(\d+)\b/g)].map((match) => Number(match[1]));
  if (matches.length === 0) {
    return 0;
  }
  return Math.max(...matches);
}

function analyze(report) {
  const messages = [];
  for (const file of report) {
    const relativePath = path.relative(process.cwd(), file.filePath).replaceAll(path.sep, '/');
    for (const message of file.messages) {
      if (!rules.includes(message.ruleId)) {
        continue;
      }
      messages.push({
        file: relativePath,
        line: message.line,
        column: message.column,
        ruleId: message.ruleId,
        metric: metricValue(message.message),
        message: message.message,
      });
    }
  }

  const byRule = Object.fromEntries(rules.map((rule) => [rule, 0]));
  const maxMetricByRule = Object.fromEntries(rules.map((rule) => [rule, 0]));
  const byFile = {};
  for (const message of messages) {
    byRule[message.ruleId] += 1;
    maxMetricByRule[message.ruleId] = Math.max(maxMetricByRule[message.ruleId], message.metric);
    byFile[message.file] = (byFile[message.file] ?? 0) + 1;
  }

  return {
    total: messages.length,
    byRule,
    maxMetricByRule,
    topFiles: Object.entries(byFile)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 15)
      .map(([file, count]) => ({ file, count })),
    worstMessages: messages
      .sort((left, right) => right.metric - left.metric || left.file.localeCompare(right.file))
      .slice(0, 15),
  };
}

function loadBaseline() {
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

function writeBaseline(summary) {
  const baseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    note: 'Complexity ratchet. Validation fails when totals, per-rule counts, or worst observed metrics exceed this baseline. Lower this file after refactors improve the counts.',
    rules,
    total: summary.total,
    byRule: summary.byRule,
    maxMetricByRule: summary.maxMetricByRule,
    topFiles: summary.topFiles,
    worstMessages: summary.worstMessages,
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
}

function compare(summary, baseline) {
  const failures = [];
  if (summary.total > baseline.total) {
    failures.push(`total complexity warnings increased: ${summary.total} > ${baseline.total}`);
  }

  for (const rule of rules) {
    const currentCount = summary.byRule[rule] ?? 0;
    const baselineCount = baseline.byRule[rule] ?? 0;
    if (currentCount > baselineCount) {
      failures.push(`${rule} warning count increased: ${currentCount} > ${baselineCount}`);
    }

    const currentMax = summary.maxMetricByRule[rule] ?? 0;
    const baselineMax = baseline.maxMetricByRule[rule] ?? 0;
    if (currentMax > baselineMax) {
      failures.push(`${rule} worst metric increased: ${currentMax} > ${baselineMax}`);
    }
  }

  return failures;
}

function printSummary(summary, baseline, failures) {
  console.log(`Complexity warnings: ${summary.total} / baseline ${baseline.total}`);
  for (const rule of rules) {
    console.log(
      `  ${rule}: ${summary.byRule[rule] ?? 0} / ${baseline.byRule[rule] ?? 0}` +
        ` (worst ${summary.maxMetricByRule[rule] ?? 0} / ${baseline.maxMetricByRule[rule] ?? 0})`,
    );
  }

  console.log('\nTop complexity hotspots:');
  for (const hotspot of summary.topFiles.slice(0, 8)) {
    console.log(`  ${hotspot.count}  ${hotspot.file}`);
  }

  if (summary.total < baseline.total) {
    console.log(`\nComplexity improved by ${baseline.total - summary.total} warning(s). Run pnpm complexity:update to ratchet the baseline down.`);
  }

  if (failures.length > 0) {
    console.error('\nComplexity baseline failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
  }
}

const summary = analyze(runEslint());
if (update) {
  writeBaseline(summary);
  console.log(`Updated complexity baseline at ${path.relative(process.cwd(), baselinePath)} (${summary.total} warnings).`);
  process.exit(0);
}

const baseline = loadBaseline();
const failures = compare(summary, baseline);
printSummary(summary, baseline, failures);

if (failures.length > 0) {
  process.exit(1);
}
