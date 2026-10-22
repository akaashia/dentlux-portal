import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../backend/config.mjs';
import { openDatabase } from '../backend/db.mjs';
import { createApp } from '../backend/app.mjs';
import { addDays, localDate } from '../backend/booking.mjs';

export async function fixture(databaseUrl = process.env.TEST_DATABASE_URL) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dentlux-test-'));
  let schemaPool, schema;
  if (databaseUrl) {
    const { Pool } = await import('pg');
    const { randomUUID } = await import('node:crypto');
    schemaPool = new Pool({ connectionString: databaseUrl });
    schema = `dentlux_test_${randomUUID().replaceAll('-', '')}`;
    await schemaPool.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    databaseUrl = url.toString();
  }
  const config = loadConfig({
    DATA_DIR: dir,
    SQLITE_PATH: ':memory:',
    DATA_ENCRYPTION_KEY: 'ab'.repeat(32),
    AUTH_PEPPER: 'test-pepper-'.repeat(4),
    DEMO_MODE: 'true',
    APP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: databaseUrl,
  });
  const db = await openDatabase(config);
  const { app, crypto, registry } = createApp(db, config);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, { method = 'GET', body, cookie, origin = config.origin } = {}) {
    const response = await fetch(`${base}/api${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      headers: response.headers,
    };
  }
  async function login(phone = '+77001111111') {
    const challenge = await request('/auth/request', { method: 'POST', body: { phone } });
    if (challenge.status !== 200)
      throw new Error(`OTP request failed: ${JSON.stringify(challenge)}`);
    const result = await request('/auth/verify', {
      method: 'POST',
      body: { phone, challengeId: challenge.body.challengeId, code: challenge.body.demoCode },
    });
    if (result.status !== 200) throw new Error(`OTP verify failed: ${JSON.stringify(result)}`);
    return result;
  }
  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    registry.clear();
    if (schemaPool) {
      await schemaPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await schemaPool.end();
    }
    rmSync(dir, { recursive: true, force: true });
  }
  let date = addDays(localDate(), 1);
  if (new Date(`${date}T12:00:00+05:00`).getUTCDay() === 0) date = addDays(date, 1);
  return { db, config, crypto, request, login, close, base, date };
}
export const bookingBody = (date, time = '10:00') => ({
  doctorId: 'aida',
  serviceId: 'consultation',
  date,
  time,
  name: 'Synthetic Test Patient',
  consent: true,
  notify: true,
});
