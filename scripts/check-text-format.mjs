import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const binaryExtensions = new Set([
  '.avif',
  '.bmp',
  '.db',
  '.dll',
  '.exe',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.node',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
]);

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.env',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.ps1',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const textBasenames = new Set([
  '.editorconfig',
  '.env.example',
  '.env.test.example',
  '.gitattributes',
  '.gitignore',
  'Dockerfile',
]);

function git(args, options = {}) {
  return execFileSync('git', args, {
    ...options,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function stagedFiles() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    encoding: 'utf8',
  });

  return output.split('\0').filter(Boolean);
}

function extensionOf(path) {
  const name = basenameOf(path);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(dotIndex).toLowerCase() : '';
}

function basenameOf(path) {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function looksBinary(buffer) {
  return buffer.includes(0);
}

function shouldCheck(path, buffer) {
  const basename = basenameOf(path);
  const extension = extensionOf(path);

  if (binaryExtensions.has(extension)) {
    return false;
  }

  return textBasenames.has(basename) || textExtensions.has(extension) || !looksBinary(buffer);
}

function stagedBlob(path) {
  return git(['show', `:${path}`], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
}

function checkFile(path) {
  const buffer = stagedBlob(path);

  if (!shouldCheck(path, buffer)) {
    return [];
  }

  const problems = [];

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    problems.push('has a UTF-8 BOM');
  }

  if (buffer.includes(13)) {
    problems.push('uses CRLF/CR line endings');
  }

  try {
    utf8Decoder.decode(buffer);
  } catch {
    problems.push('is not valid UTF-8');
  }

  return problems;
}

const failures = [];

for (const file of stagedFiles()) {
  const problems = checkFile(file);
  if (problems.length > 0) {
    failures.push(`${file}: ${problems.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('Text format check failed. Commit text files as UTF-8 without BOM and LF (\\n) line endings.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('text format check passed');
