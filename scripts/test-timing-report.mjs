#!/usr/bin/env node
/**
 * Test execution timing report.
 *
 * Distills vitest's JSON reporter output (per-case durations, which vitest
 * measures but never persists) into a duration baseline we can optimize against.
 *
 * Inputs:
 *   - reports/test-timing/raw.json    (vitest --reporter=json output)
 *
 * Outputs:
 *   - reports/test-timing/report.json (machine-readable, every file + every case)
 *   - reports/test-timing/index.html  (browsable, bar charts)
 *   - console summary                 (totals + worst offenders)
 *
 * Run via `pnpm test:timing`, which produces raw.json first.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ISTANBUL_BASE_CSS } from './lib/istanbul-css.mjs';

const OUT_DIR = path.join('reports', 'test-timing');
const RAW = path.join(OUT_DIR, 'raw.json');
const TOP_CASES = 50; // full list stays in report.json; the page shows the actionable head

// Seconds at which a single file / a single case turns yellow, then red. Not
// derived from anything but experience: a case over a second is doing I/O or
// waiting on a timer, and that is what we want the report to surface.
const FILE_THRESHOLDS = { medium: 5, low: 10 };
const CASE_THRESHOLDS = { medium: 0.5, low: 1 };

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Istanbul's palette, inverted: slower is worse, so more time maps to the redder end.
 * `thresholds` of null means "don't rank these rows" (totals, where red says nothing).
 */
function severityClass(ms, thresholds) {
  if (!thresholds) return 'neutral';
  const s = ms / 1000;
  if (s >= thresholds.low) return 'low';
  if (s >= thresholds.medium) return 'medium';
  return 'high';
}

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '-');

function buildReport(raw) {
  const root = process.cwd().replace(/\\/g, '/');
  const rel = (p) => p.replace(/\\/g, '/').replace(`${root}/`, '');
  // tests/server vs tests/client == the two vitest projects; the JSON report carries no project field.
  const projectOf = (file) => (file.startsWith('tests/server/') ? 'server' : 'client');

  const files = [];
  const cases = [];
  for (const result of raw.testResults) {
    const file = rel(result.name);
    const project = projectOf(file);
    const own = result.assertionResults.map((a) => ({
      file,
      project,
      name: a.fullName,
      ms: a.duration ?? 0,
      status: a.status,
    }));
    cases.push(...own);
    files.push({
      file,
      project,
      cases: own.length,
      // vitest derives a file's endTime from its case durations, so file time is
      // case time only: setup/import/transform cost lands in `unattributedMs`.
      ms: own.reduce((s, c) => s + c.ms, 0),
    });
  }

  const caseMs = cases.reduce((s, c) => s + c.ms, 0);
  const wallMs = Math.max(...raw.testResults.map((f) => f.endTime)) - raw.startTime;

  return {
    generatedAt: new Date().toISOString(),
    wallMs,
    caseMs,
    unattributedMs: wallMs - caseMs,
    totals: {
      files: files.length,
      cases: cases.length,
      failed: raw.numFailedTests,
    },
    projects: ['server', 'client'].map((name) => {
      const own = files.filter((f) => f.project === name);
      return {
        name,
        files: own.length,
        cases: own.reduce((s, f) => s + f.cases, 0),
        ms: own.reduce((s, f) => s + f.ms, 0),
      };
    }),
    files: files.sort((a, b) => b.ms - a.ms),
    cases: cases.sort((a, b) => b.ms - a.ms),
  };
}

/** One <tr> with an Istanbul-style horizontal bar, scaled against the row set's max. */
function barRow(label, ms, max, total, thresholds, suffix = '') {
  const sev = severityClass(ms, thresholds);
  const fill = max ? Math.round((ms / max) * 100) : 0;
  return `<tr>
    <td class="file ${sev}" data-value="${escapeHtml(label)}">${escapeHtml(label)}${suffix}</td>
    <td data-value="${ms}" class="pic ${sev}">
    <div class="chart"><div class="cover-fill" style="width: ${fill}%"></div><div class="cover-empty" style="width: ${100 - fill}%"></div></div>
    </td>
    <td data-value="${ms}" class="pct ${sev}">${fmt(ms)}</td>
    <td data-value="${ms}" class="abs ${sev}">${pct(ms, total)}</td>
    </tr>`;
}

function barTable(heading, note, rows, total, thresholds) {
  const max = Math.max(...rows.map((r) => r.ms), 0);
  return `<div class="pad1">
        <h2>${escapeHtml(heading)}</h2>
        <p class="quiet small">${escapeHtml(note)}</p>
<table class="coverage-summary">
<thead>
<tr>
   <th class="file">Name</th>
   <th class="pic"></th>
   <th class="pct">Duration</th>
   <th class="abs">Share</th>
</tr>
</thead>
<tbody>
${rows.map((r) => barRow(r.label, r.ms, max, total, thresholds, r.suffix ?? '')).join('\n')}
</tbody>
</table>
</div>`;
}

function renderHtml(report) {
  const summaryBlocks = [
    ['Wall clock', fmt(report.wallMs)],
    ['Case time', fmt(report.caseMs)],
    ['Unattributed', fmt(report.unattributedMs)],
    ['Files', report.totals.files],
    ['Cases', report.totals.cases],
    ['Failed', report.totals.failed],
  ]
    .map(
      ([label, value]) =>
        `<div class='fl pad1y space-right2'><span class="strong">${escapeHtml(value)} </span><span class="quiet">${label}</span></div>`,
    )
    .join('\n            ');

  const projectRows = report.projects.map((p) => ({
    label: p.name,
    ms: p.ms,
    suffix: `<span class="quiet">&nbsp;${p.files} files, ${p.cases} cases</span>`,
  }));

  return `<!doctype html>
<html lang="en">
<head>
    <title>Test timing report</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style type='text/css'>${ISTANBUL_BASE_CSS}
.neutral .cover-fill { background:#0074D9 }
.neutral .chart { border:1px solid #0074D9 }
</style>
</head>
<body>
<div class='wrapper'>
    <div class='pad1'>
        <h1>Test timing report</h1>
        <div class='clearfix'>
            ${summaryBlocks}
        </div>
        <p class="quiet">
            Durations come from vitest's own per-case measurements. Wall clock is the whole
            <code>vitest run</code>; case time is the sum of the cases themselves; the difference is
            setup files, imports, transform and pool startup, which is billed to no single case.
            Bars are scaled against the slowest row in their own table.
        </p>
    </div>
    <div class='status-line ${severityClass(report.wallMs / Math.max(report.totals.files, 1), FILE_THRESHOLDS)}'></div>
${barTable('By project', 'Server runs single-fork (serial); client files run in parallel — so these are weights, not a schedule.', projectRows, report.caseMs, null)}
${barTable(`Slowest files (${report.files.length})`, 'Sum of each file’s own cases.', report.files.map((f) => ({ label: f.file, ms: f.ms, suffix: `<span class="quiet">&nbsp;${f.cases} cases</span>` })), report.caseMs, FILE_THRESHOLDS)}
${barTable(`Slowest cases (top ${Math.min(TOP_CASES, report.cases.length)} of ${report.cases.length})`, 'Full list is in report.json.', report.cases.slice(0, TOP_CASES).map((c) => ({ label: `${c.file} › ${c.name}`, ms: c.ms })), report.caseMs, CASE_THRESHOLDS)}
                <div class='push'></div><!-- for sticky footer -->
            </div><!-- /wrapper -->
            <div class='footer quiet pad2 space-top1 center small'>
                Test timing report generated from vitest at ${escapeHtml(report.generatedAt)}
            </div>
    </body>
</html>
`;
}

async function main() {
  let raw;
  try {
    raw = JSON.parse(await readFile(RAW, 'utf8'));
  } catch {
    console.error(`Missing or unreadable ${RAW}. Run \`pnpm test:timing\` (not this script alone).`);
    process.exit(1);
  }

  const report = buildReport(raw);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(OUT_DIR, 'index.html'), renderHtml(report));

  // ── Console summary ──────────────────────────────────────
  console.log('\nTest timing report');
  console.log('==================');
  console.log(`Wall clock:   ${fmt(report.wallMs)}`);
  console.log(
    `Case time:    ${fmt(report.caseMs)} (${pct(report.caseMs, report.wallMs)} of wall clock)`,
  );
  console.log(`Unattributed: ${fmt(report.unattributedMs)}  setup/import/transform/pool startup`);
  console.log(
    `Tests:        ${report.totals.cases} cases in ${report.totals.files} files, ${report.totals.failed} failed\n`,
  );

  console.log('By project:');
  for (const p of report.projects) {
    console.log(
      `  ${p.name.padEnd(8)} ${fmt(p.ms).padStart(9)}  ${String(p.cases).padStart(4)} cases in ${p.files} files`,
    );
  }

  console.log('\nSlowest files:');
  for (const f of report.files.slice(0, 10)) {
    console.log(`  ${fmt(f.ms).padStart(9)}  ${f.file}`);
  }

  console.log('\nSlowest cases:');
  for (const c of report.cases.slice(0, 10)) {
    console.log(`  ${fmt(c.ms).padStart(9)}  ${c.file} > ${c.name}`);
  }

  console.log(`\nFull detail: ${path.join(OUT_DIR, 'report.json')}`);
  console.log(`Browsable:   ${path.join(OUT_DIR, 'index.html')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
