#!/usr/bin/env node
/**
 * Code complexity report.
 *
 * Reuses the complexity-related ESLint rules already configured in
 * eslint.config.js (cyclomatic complexity, cognitive complexity, depth,
 * function length, parameter count) and turns their warnings into a focused,
 * ranked report instead of inline lint noise.
 *
 * Outputs:
 *   - reports/complexity/report.json  (machine-readable, full detail)
 *   - reports/complexity/index.html   (browsable report)
 *   - console summary                 (per-rule counts + worst offenders)
 *
 * Exit code is 0 unless --max-violations=<n> is passed and exceeded, so it can
 * be wired into CI as a soft or hard gate.
 */
import { ESLint } from 'eslint';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ISTANBUL_BASE_CSS } from './lib/istanbul-css.mjs';

// Thresholds mirror the warn limits configured in eslint.config.js. Used to
// rank/colour each violation by how far it runs over the limit.
const RULE_THRESHOLDS = {
  complexity: 10,
  'max-depth': 4,
  'max-lines-per-function': 60,
  'max-params': 5,
  'sonarjs/cognitive-complexity': 10,
};

const COMPLEXITY_RULES = new Set(Object.keys(RULE_THRESHOLDS));

const args = process.argv.slice(2);
const maxArg = args.find((a) => a.startsWith('--max-violations='));
const maxViolations = maxArg ? Number.parseInt(maxArg.split('=')[1], 10) : null;

/** Pull the first integer out of an ESLint message ("complexity of 25" -> 25). */
function extractMetric(message) {
  const match = message.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Severity classes reuse Istanbul's palette (high=green, medium=yellow,
 * low=red) so the report matches the coverage report visually. For complexity,
 * "worse" (further over threshold) maps to the redder end.
 */
function severityClass(ratio) {
  if (ratio >= 3) return 'low';
  if (ratio >= 1.5) return 'medium';
  return 'high';
}

function renderHtml(report) {
  const summaryBlocks = [
    `<div class='fl pad1y space-right2'><span class="strong">${report.filesScanned} </span><span class="quiet">Files scanned</span></div>`,
    `<div class='fl pad1y space-right2'><span class="strong">${report.totalViolations} </span><span class="quiet">Violations</span></div>`,
    ...Object.entries(report.byRule).map(
      ([rule, count]) =>
        `<div class='fl pad1y space-right2'><span class="strong">${count} </span><span class="quiet">${escapeHtml(rule)}</span> <span class='fraction'>&gt;${RULE_THRESHOLDS[rule] ?? '?'}</span></div>`,
    ),
  ].join('\n            ');

  const violationRows = report.violations
    .map((v) => {
      const threshold = RULE_THRESHOLDS[v.rule] ?? v.metric;
      const ratio = threshold ? v.metric / threshold : 1;
      const sev = severityClass(ratio);
      const fill = Math.min(100, Math.round((ratio / 4) * 100));
      return `<tr>
    <td class="file ${sev}" data-value="${escapeHtml(v.file)}">${escapeHtml(v.file)}<span class="quiet">:${v.line}</span></td>
    <td data-value="${v.metric}" class="pic ${sev}">
    <div class="chart"><div class="cover-fill" style="width: ${fill}%"></div><div class="cover-empty" style="width: ${100 - fill}%"></div></div>
    </td>
    <td data-value="${v.metric}" class="pct ${sev}">${v.metric}</td>
    <td data-value="${threshold}" class="abs ${sev}">&gt;${threshold}</td>
    <td>${escapeHtml(v.rule)}</td>
    <td class="quiet">${escapeHtml(v.message)}</td>
    </tr>`;
    })
    .join('\n');

  const overallSeverity =
    report.totalViolations === 0 ? 'high' : report.totalViolations > 50 ? 'low' : 'medium';

  return `<!doctype html>
<html lang="en">
<head>
    <title>Code complexity report</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style type='text/css'>${ISTANBUL_BASE_CSS}</style>
</head>
<body>
<div class='wrapper'>
    <div class='pad1'>
        <h1>Code complexity report</h1>
        <div class='clearfix'>
            ${summaryBlocks}
        </div>
        <p class="quiet">
            Thresholds come from eslint.config.js. Higher metric is worse; rows are colored by how far over threshold they run.
        </p>
    </div>
    <div class='status-line ${overallSeverity}'></div>
    <div class="pad1">
<table class="coverage-summary">
<thead>
<tr>
   <th class="file">Location</th>
   <th class="pic"></th>
   <th class="pct">Metric</th>
   <th class="abs">Threshold</th>
   <th>Rule</th>
   <th>Detail</th>
</tr>
</thead>
<tbody>
${violationRows}
</tbody>
</table>
</div>
                <div class='push'></div><!-- for sticky footer -->
            </div><!-- /wrapper -->
            <div class='footer quiet pad2 space-top1 center small'>
                Code complexity report generated from ESLint at ${escapeHtml(report.generatedAt)}
            </div>
    </body>
</html>
`;
}

async function main() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);

  const violations = [];
  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.filePath).replace(/\\/g, '/');
    for (const msg of result.messages) {
      if (msg.ruleId && COMPLEXITY_RULES.has(msg.ruleId)) {
        violations.push({
          file: relPath,
          line: msg.line,
          rule: msg.ruleId,
          metric: extractMetric(msg.message),
          message: msg.message,
        });
      }
    }
  }

  const byRule = {};
  for (const rule of COMPLEXITY_RULES) {
    byRule[rule] = violations.filter((v) => v.rule === rule).length;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    filesScanned: results.length,
    totalViolations: violations.length,
    byRule,
    violations: violations.sort((a, b) => b.metric - a.metric),
  };

  const outDir = path.join('reports', 'complexity');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(outDir, 'index.html'), renderHtml(report));

  // ── Console summary ──────────────────────────────────────
  console.log('\nCode complexity report');
  console.log('======================');
  console.log(`Files scanned:    ${report.filesScanned}`);
  console.log(`Total violations: ${report.totalViolations}\n`);

  console.log('By rule:');
  for (const [rule, count] of Object.entries(byRule)) {
    console.log(`  ${rule.padEnd(32)} ${count}`);
  }

  const worst = report.violations.slice(0, 15);
  if (worst.length > 0) {
    console.log('\nWorst offenders:');
    for (const v of worst) {
      console.log(`  [${String(v.metric).padStart(4)}] ${v.rule}  ${v.file}:${v.line}`);
    }
  }
  console.log('\nFull detail: reports/complexity/report.json');
  console.log('Browsable:   reports/complexity/index.html');

  if (maxViolations !== null && report.totalViolations > maxViolations) {
    console.error(
      `\nComplexity gate failed: ${report.totalViolations} violations exceed limit of ${maxViolations}.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
