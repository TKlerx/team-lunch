#!/usr/bin/env node
// Refresh the FAIM dependency graph from a fresh scip-typescript index.
// Run when `faim stale` flags scanner_scan facts (912 machine-facts can't be hand-edited).
// ponytail: filter is a single substring exclude; broaden the EXCLUDE list if more generated trees appear.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EXCLUDE = ['src/server/generated/']; // Prisma client output: regenerated, not authored -> pure noise
const INDEX = 'index.scip';
const FILTERED = 'scip-deps.filtered.jsonl';
const QUERY = 'import graph (scip-typescript)';
// shell: true so Windows resolves the `faim`/`pnpm` .cmd launchers (not directly spawnable).
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true }).toString();

console.error('> scip-typescript index');
execFileSync('pnpm', ['exec', 'scip-typescript', 'index', '--no-progress-bar'], { stdio: 'inherit', shell: true });

console.error('> faim scan scip');
const lines = run('faim', ['scan', 'scip', INDEX]).split(/\r?\n/).filter(Boolean);
const kept = lines.filter((l) => !EXCLUDE.some((p) => l.includes(p)));
writeFileSync(FILTERED, kept.join('\n') + '\n');
console.error(`  kept ${kept.length}, dropped ${lines.length - kept.length}`);

console.error('> faim import --replace');
execFileSync(
  'faim',
  // shell:true joins args unquoted, so wrap the spaced/paren'd query; the shell strips the quotes,
  // faim receives QUERY verbatim -> matches the stored query so --replace stays idempotent.
  ['import', FILTERED, '--format', 'jsonl', '--source', 'scanner_scan', '--query', `"${QUERY}"`, '--replace'],
  { stdio: 'inherit', shell: true },
);
console.error('done. run `faim validate` to confirm.');
