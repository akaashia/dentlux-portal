import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'backend/server.mjs'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    stdio: 'inherit',
  }),
];
function stop() {
  for (const child of children) child.kill();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
for (const child of children)
  child.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  });
