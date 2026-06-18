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

// Istanbul's base.css, embedded verbatim so the report is self-contained and
// pixel-matches the coverage report without external asset references.
const ISTANBUL_BASE_CSS = `
body, html { margin:0; padding: 0; height: 100%; }
body { font-family: Helvetica Neue, Helvetica, Arial; font-size: 14px; color:#333; }
.small { font-size: 12px; }
*, *:after, *:before { box-sizing:border-box; }
h1 { font-size: 20px; margin: 0;}
h2 { font-size: 14px; }
a { color:#0074D9; text-decoration:none; }
a:hover { text-decoration:underline; }
.strong { font-weight: bold; }
.space-top1 { padding: 10px 0 0 0; }
.pad1y { padding: 10px 0; }
.pad2 { padding: 20px; }
.pad1 { padding: 10px; }
.space-right2 { padding-right:20px; }
.center { text-align:center; }
.clearfix { display:block; }
.clearfix:after { content:''; display:block; height:0; clear:both; visibility:hidden; }
.fl { float: left; }
.quiet { color: #7f7f7f; color: rgba(0,0,0,0.5); }
.quiet a { opacity: 0.7; }
.fraction { font-family: Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 10px; color: #555; background: #E8E8E8; padding: 4px 5px; border-radius: 3px; vertical-align: middle; }
.coverage-summary { border-collapse: collapse; width: 100%; }
.coverage-summary tr { border-bottom: 1px solid #bbb; }
.coverage-summary td, .coverage-summary th { padding: 10px; }
.coverage-summary tbody { border: 1px solid #bbb; }
.coverage-summary td { border-right: 1px solid #bbb; }
.coverage-summary td:last-child { border-right: none; }
.coverage-summary th { text-align: left; font-weight: normal; white-space: nowrap; }
.coverage-summary th.file { border-right: none !important; }
.coverage-summary th.pic, .coverage-summary th.abs, .coverage-summary td.pct, .coverage-summary td.abs { text-align: right; }
.coverage-summary td.file { white-space: nowrap; }
.coverage-summary td.pic { min-width: 120px !important; }
.status-line { height: 10px; }
.red.solid, .status-line.low, .low .cover-fill { background:#C21F39 }
.low .chart { border:1px solid #C21F39 }
.low { background:#FCE1E5 }
.high { background:rgb(230,245,208) }
.status-line.high, .high .cover-fill { background:rgb(77,146,33) }
.high .chart { border:1px solid rgb(77,146,33) }
.status-line.medium, .medium .cover-fill { background: #f9cd0b; }
.medium .chart { border:1px solid #f9cd0b; }
.medium { background: #fff4c2; }
.cover-fill, .cover-empty { display:inline-block; height: 12px; }
.chart { line-height: 0; }
.cover-empty { background: white; }
.cover-full { border-right: none !important; }
.wrapper { min-height: 100%; height: auto !important; height: 100%; margin: 0 auto -48px; }
.footer, .push { height: 48px; }
`;

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
