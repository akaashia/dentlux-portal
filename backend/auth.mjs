import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { phoneSchema, HttpError, audit } from './booking.mjs';
import { sendSms } from './notifications.mjs';

export function createLimiter() {
  const buckets = new Map();
  return (key, max, windowMs = 60000) => {
    const now = Date.now();
    if (buckets.size > 10000)
      for (const [k, value] of buckets) if (value.until <= now) buckets.delete(k);
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > max) throw new HttpError(429, 'RATE_LIMITED');
  };
}
export function authRoutes(app, db, config, crypto, limit) {
  app.post('/api/auth/request', async (req, res) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    limit(`otp-ip:${req.ip}`, 5);
    limit(`otp-phone:${crypto.hash(phone)}`, 3);
    const id = randomUUID(),
      code = String(randomInt(100000, 1000000));
    await db.transaction(async (tx) => {
      await tx.query('UPDATE otp_challenges SET consumed=1 WHERE phone_hash=$1', [
        crypto.hash(phone),
      ]);
      await tx.query(
        'INSERT INTO otp_challenges(id,phone_hash,code_hash,expires_at) VALUES($1,$2,$3,$4)',
        [
          id,
          crypto.hash(phone),
          crypto.hash(`${id}:${code}`),
          new Date(Date.now() + 5 * 60000).toISOString(),
        ],
      );
    });
    try {
      await sendSms(config, phone, `DentLux: ${code}. 5 min.`, id);
    } catch {
      await db.query('UPDATE otp_challenges SET consumed=1 WHERE id=$1', [id]);
      throw new HttpError(503, 'SMS_UNAVAILABLE');
    }
    res.json({ challengeId: id, expiresIn: 300, ...(config.demo ? { demoCode: code } : {}) });
  });
  app.post('/api/auth/verify', async (req, res) => {
    const input = z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/),
        phone: phoneSchema,
      })
      .parse(req.body);
    limit(`verify-ip:${req.ip}`, 20);
    const result = await db.transaction(async (tx) => {
      const [challenge] = await tx.query(
        `SELECT * FROM otp_challenges WHERE id=$1${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
        [input.challengeId],
      );
      if (
        !challenge ||
        challenge.phone_hash !== crypto.hash(input.phone) ||
        challenge.consumed ||
        challenge.attempts >= 3 ||
        challenge.expires_at <= new Date().toISOString()
      )
        return { error: true };
      await tx.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      if (
        !timingSafeEqual(
          Buffer.from(challenge.code_hash),
          Buffer.from(crypto.hash(`${challenge.id}:${input.code}`)),
        )
      )
        return { error: true };
      await tx.query('UPDATE otp_challenges SET consumed=1 WHERE id=$1', [challenge.id]);
      await tx.query(
        `INSERT INTO users(id,phone_hash,phone_enc,name_enc,role,created_at) VALUES($1,$2,$3,$4,'patient',$5)
        ON CONFLICT(phone_hash) DO NOTHING`,
        [
          randomUUID(),
          crypto.hash(input.phone),
          crypto.encrypt(input.phone),
          crypto.encrypt('Пациент'),
          new Date().toISOString(),
        ],
      );
      const [user] = await tx.query('SELECT * FROM users WHERE phone_hash=$1', [
        crypto.hash(input.phone),
      ]);
      const token = randomBytes(32).toString('hex');
      await tx.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
        crypto.hash(token),
        user.id,
        new Date(Date.now() + 30 * 60000).toISOString(),
      ]);
      await audit(tx, user.id, 'auth.login', user.id);
      return { token, user };
    });
    if (result.error) throw new HttpError(400, 'INVALID_OTP');
    res.cookie('dentlux_session', result.token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      maxAge: 30 * 60000,
      path: '/',
    });
    res.json({ user: publicUser(result.user, crypto) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [crypto.hash(token)]);
    res.clearCookie('dentlux_session', {
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      path: '/',
    });
    res.json({ ok: true });
  });
}
function sessionToken(req) {
  return /(?:^|;\s*)dentlux_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
}
export function publicUser(user, crypto) {
  return {
    id: user.id,
    role: user.role,
    name: crypto.decrypt(user.name_enc),
    doctorId: user.doctor_id,
    phone: crypto.decrypt(user.phone_enc),
  };
}
export function authMiddleware(db, crypto) {
  return async (req, _res, next) => {
    const token = sessionToken(req);
    if (token) {
      const [user] = await db.query(
        `SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2`,
        [crypto.hash(token), new Date().toISOString()],
      );
      req.user = user || null;
    }
    next();
  };
}
export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED');
    if (roles.length && !roles.includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN');
    next();
  };
}
