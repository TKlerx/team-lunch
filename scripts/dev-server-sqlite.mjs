import { spawn, spawnSync } from 'node:child_process';

function runOrThrow(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const env = {
  ...process.env,
  DB_PROVIDER: 'sqlite',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.sqlite',
};

runOrThrow('npx', ['prisma', 'generate', '--schema', 'prisma/schema.sqlite.prisma'], env);
runOrThrow('npx', ['prisma', 'db', 'push', '--schema', 'prisma/schema.sqlite.prisma', '--skip-generate'], env);

const child = spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

