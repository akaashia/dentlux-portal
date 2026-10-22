import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../backend/config.mjs';
import { openDatabase } from '../backend/db.mjs';
import { createApp } from '../backend/app.mjs';
const dataDir = mkdtempSync(path.join(tmpdir(), 'dentlux-e2e-'));
const config = loadConfig({
  DATA_DIR: dataDir,
  SQLITE_PATH: ':memory:',
  DEMO_MODE: 'true',
  APP_ORIGIN: 'http://127.0.0.1:3101',
});
const db = await openDatabase(config);
const { app, registry } = createApp(db, config);
const server = createServer(app);
server.listen(3101, '127.0.0.1');
async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  registry.clear();
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
