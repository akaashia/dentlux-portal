import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const demo = !production && env.DEMO_MODE !== 'false';
  if (demo && env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST))
    throw new Error('Demo mode must bind to a loopback address');
  const dataDir = env.DATA_DIR || path.resolve('.data');
  mkdirSync(dataDir, { recursive: true });
  let key = env.DATA_ENCRYPTION_KEY;
  if (!key && demo) {
    const keyPath = path.join(dataDir, 'development.key');
    try {
      key = readFileSync(keyPath, 'utf8').trim();
    } catch {
      key = randomBytes(32).toString('hex');
      writeFileSync(keyPath, key, { mode: 0o600 });
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(key || ''))
    throw new Error('DATA_ENCRYPTION_KEY must be 32 random bytes encoded as hex');
  if (!demo && (!env.AUTH_PEPPER || env.AUTH_PEPPER.length < 32))
    throw new Error('AUTH_PEPPER must contain at least 32 characters');
  if (production && !env.DATABASE_URL)
    throw new Error('Production requires PostgreSQL DATABASE_URL');
  if (production && !env.APP_ORIGIN?.startsWith('https://'))
    throw new Error('Production requires HTTPS APP_ORIGIN');
  if (production && !env.METRICS_TOKEN) throw new Error('Production requires METRICS_TOKEN');
  if (!demo && (!env.SMS_GATEWAY_URL || !env.SMS_GATEWAY_TOKEN))
    throw new Error('SMS gateway credentials are required outside demo mode');
  if (production && !env.SMS_GATEWAY_URL?.startsWith('https://'))
    throw new Error('SMS gateway must use HTTPS');
  const staff = JSON.parse(env.STAFF_ACCOUNTS || '[]');
  if (!Array.isArray(staff)) throw new Error('STAFF_ACCOUNTS must be an array');
  return {
    production,
    demo,
    dataDir,
    encryptionKey: key,
    pepper: env.AUTH_PEPPER || key,
    databaseUrl: env.DATABASE_URL || null,
    sqlitePath: env.SQLITE_PATH || path.join(dataDir, 'dentlux.sqlite'),
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3001),
    origin: env.APP_ORIGIN || 'http://localhost:5173',
    publicUrl: env.PUBLIC_URL || env.APP_ORIGIN || 'http://localhost:5173',
    metricsToken: env.METRICS_TOKEN || '',
    smsUrl: env.SMS_GATEWAY_URL,
    smsToken: env.SMS_GATEWAY_TOKEN,
    telegramToken: env.TELEGRAM_BOT_TOKEN,
    staff,
  };
}
