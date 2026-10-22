import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { doctors, services, clinic } from './catalog.mjs';
import { createCrypto } from './crypto.mjs';
import { authRoutes, authMiddleware, requireRoles, publicUser, createLimiter } from './auth.mjs';
import {
  createBooking,
  getSlots,
  audit,
  dateSchema,
  timeSchema,
  minutes,
  lockDoctor,
  validateHorizon,
  HttpError,
  enqueueNotifications,
} from './booking.mjs';
import { createTelegramLink } from './notifications.mjs';

export function createApp(db, config, onAvailabilityChange = () => {}) {
  const app = express(),
    crypto = createCrypto(config),
    limit = createLimiter();
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const requests = new Counter({
    name: 'dentlux_http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const latency = new Histogram({
    name: 'dentlux_http_duration_seconds',
    help: 'HTTP response duration',
    labelNames: ['route'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 0.8, 1, 2, 5],
    registers: [registry],
  });
  new Gauge({
    name: 'dentlux_notification_failures',
    help: 'Notifications requiring operator attention',
    registers: [registry],
    async collect() {
      const [row] = await db.query(
        "SELECT COUNT(*) AS count FROM notifications WHERE status='failed'",
      );
      this.set(Number(row.count));
    },
  });
  app.disable('x-powered-by');
  // Only the single internal reverse proxy is trusted in production.
  app.set('trust proxy', config.production ? 'loopback, linklocal, uniquelocal' : false);
  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const route = req.route?.path?.toString() || 'unmatched';
      requests.inc({ method: req.method, route, status: String(res.statusCode) });
      latency.observe({ route }, (performance.now() - started) / 1000);
    });
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const origins = new Set([config.origin]);
  if (config.demo) {
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:5173');
  }
  app.use('/api', (req, _res, next) => {
    limit(`api:${req.ip}`, 5000);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!origins.has(req.headers.origin)) throw new HttpError(403, 'INVALID_ORIGIN');
      if (!req.is('application/json')) throw new HttpError(415, 'JSON_REQUIRED');
    }
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: db.dialect, demo: config.demo });
  });
  app.get('/api/catalog', (_req, res) =>
    res.json({
      doctors,
      services,
      clinic,
      demo: config.demo,
      telegramAvailable: Boolean(config.telegramToken),
    }),
  );
  app.get('/api/slots', async (req, res) => {
    const input = z.object({ doctorId: z.string(), date: dateSchema }).parse(req.query);
    res.json(await getSlots(db, input.doctorId, input.date));
  });
  app.use(authMiddleware(db, crypto));
  authRoutes(app, db, config, crypto, limit);
  app.get('/api/me', (req, res) =>
    res.json({ user: req.user ? publicUser(req.user, crypto) : null }),
  );
  app.post('/api/bookings', requireRoles('patient'), async (req, res) => {
    limit(`booking:${req.user.id}`, 10);
    const booking = await createBooking(db, crypto, req.user, req.body);
    onAvailabilityChange();
    res.status(201).json(booking);
  });
  app.get('/api/bookings/:id', requireRoles('patient'), async (req, res) => {
    const [booking] = await db.query('SELECT * FROM bookings WHERE id=$1 AND patient_id=$2', [
      req.params.id,
      req.user.id,
    ]);
    if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');
    res.json(serializeBooking(booking, crypto));
  });
  app.post('/api/telegram/link', requireRoles('patient'), async (req, res) =>
    res.json(await createTelegramLink(db, config, crypto, req.user.id)),
  );
  app.delete('/api/telegram/link', requireRoles('patient'), async (req, res) => {
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM telegram_links WHERE user_id=$1', [req.user.id]);
      await tx.query('DELETE FROM telegram_tokens WHERE user_id=$1', [req.user.id]);
      await tx.query(
        "UPDATE notifications SET status='cancelled' WHERE channel='telegram' AND status IN ('pending','sending') AND booking_id IN (SELECT id FROM bookings WHERE patient_id=$1)",
        [req.user.id],
      );
      await audit(tx, req.user.id, 'telegram.unlinked', req.user.id);
    });
    res.json({ ok: true });
  });
  app.patch('/api/bookings/:id/notifications', requireRoles('patient'), async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await db.transaction(async (tx) => {
      const [booking] = await tx.query('SELECT * FROM bookings WHERE id=$1 AND patient_id=$2', [
        req.params.id,
        req.user.id,
      ]);
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');
      await tx.query('UPDATE bookings SET notify=$2 WHERE id=$1', [booking.id, Number(enabled)]);
      if (!enabled)
        await tx.query(
          "UPDATE notifications SET status='cancelled' WHERE booking_id=$1 AND status IN ('pending','sending')",
          [booking.id],
        );
      else {
        booking.notify = 1;
        booking.updated_at = new Date().toISOString();
        await enqueueNotifications(tx, booking);
      }
      await audit(tx, req.user.id, 'notifications.preference', booking.id, { enabled });
    });
    res.json({ ok: true });
  });
  app.get('/api/staff/bookings', requireRoles('receptionist', 'doctor'), async (req, res) => {
    const { date } = z.object({ date: dateSchema }).parse(req.query);
    const rows = await db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT * FROM bookings WHERE date=$1${req.user.role === 'doctor' ? ' AND doctor_id=$2' : ''} ORDER BY time,created_at`,
        req.user.role === 'doctor' ? [date, req.user.doctor_id] : [date],
      );
      await audit(tx, req.user.id, 'bookings.viewed', date, { count: rows.length });
      return rows;
    });
    res.json({ bookings: rows.map((row) => serializeBooking(row, crypto)) });
  });
  app.patch('/api/staff/bookings/:id', requireRoles('receptionist'), async (req, res) => {
    const input = z
      .object({
        status: z.enum(['scheduled', 'arrived', 'completed', 'no_show', 'cancelled']).optional(),
        date: dateSchema.optional(),
        time: timeSchema.optional(),
        expectedUpdatedAt: z.string(),
      })
      .parse(req.body);
    const [existing] = await db.query('SELECT doctor_id FROM bookings WHERE id=$1', [
      req.params.id,
    ]);
    if (!existing) throw new HttpError(404, 'BOOKING_NOT_FOUND');
    const updated = await db.transaction(async (tx) => {
      await lockDoctor(tx, existing.doctor_id);
      const [booking] = await tx.query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
      if (booking.updated_at !== input.expectedUpdatedAt) throw new HttpError(409, 'STALE_BOOKING');
      const date = input.date || booking.date,
        time = input.time || booking.time,
        status = input.status || booking.status;
      const moved = date !== booking.date || time !== booking.time;
      if (Boolean(input.date) !== Boolean(input.time))
        throw new HttpError(400, 'DATE_AND_TIME_REQUIRED');
      if (moved && (booking.status !== 'scheduled' || status !== 'scheduled'))
        throw new HttpError(400, 'CANNOT_RESCHEDULE');
      if (moved || (booking.status === 'cancelled' && status !== 'cancelled')) {
        const availability = await getSlots(tx, booking.doctor_id, date);
        if (!availability.slots.some((s) => s.time === time && s.available))
          throw new HttpError(409, 'SLOT_UNAVAILABLE');
      }
      const now = new Date(Math.max(Date.now(), +new Date(booking.updated_at) + 1)).toISOString();
      await tx.query('UPDATE bookings SET status=$2,date=$3,time=$4,updated_at=$5 WHERE id=$1', [
        booking.id,
        status,
        date,
        time,
        now,
      ]);
      await audit(
        tx,
        req.user.id,
        moved ? 'booking.rescheduled' : 'booking.status_changed',
        booking.id,
        {
          previousStatus: booking.status,
          status,
          previousDate: booking.date,
          previousTime: booking.time,
          date,
          time,
        },
      );
      const changed = { ...booking, status, date, time, updated_at: now };
      if (moved || status !== 'scheduled')
        await tx.query(
          "UPDATE notifications SET status='cancelled' WHERE booking_id=$1 AND status IN ('pending','sending')",
          [booking.id],
        );
      if (moved || (status === 'scheduled' && booking.status !== 'scheduled'))
        await enqueueNotifications(tx, changed);
      return changed;
    });
    onAvailabilityChange();
    res.json(serializeBooking(updated, crypto));
  });
  app.put('/api/staff/schedules', requireRoles('receptionist'), async (req, res) => {
    const input = z
      .object({
        doctorId: z.string(),
        date: dateSchema,
        start: timeSchema,
        end: timeSchema,
        dayOff: z.boolean(),
      })
      .parse(req.body);
    validateHorizon(input.date);
    if (
      minutes(input.start) < 8 * 60 ||
      minutes(input.end) > 20 * 60 ||
      minutes(input.start) >= minutes(input.end)
    )
      throw new HttpError(400, 'INVALID_SCHEDULE');
    await db.transaction(async (tx) => {
      await lockDoctor(tx, input.doctorId);
      const active = await tx.query(
        "SELECT time FROM bookings WHERE doctor_id=$1 AND date=$2 AND status <> 'cancelled'",
        [input.doctorId, input.date],
      );
      if (active.some((b) => input.dayOff || b.time < input.start || b.time >= input.end))
        throw new HttpError(409, 'SCHEDULE_HAS_BOOKINGS');
      await tx.query(
        `INSERT INTO schedules(doctor_id,date,start_time,end_time,day_off) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(doctor_id,date) DO UPDATE SET start_time=$3,end_time=$4,day_off=$5`,
        [input.doctorId, input.date, input.start, input.end, Number(input.dayOff)],
      );
      await audit(tx, req.user.id, 'schedule.updated', input.doctorId, input);
    });
    onAvailabilityChange();
    res.json({ ok: true });
  });
  app.get('/api/staff/statistics', requireRoles('receptionist'), async (req, res) => {
    const { date } = z.object({ date: dateSchema }).parse(req.query);
    const rows = await db.query('SELECT status,doctor_id,price FROM bookings WHERE date=$1', [
      date,
    ]);
    const capacity = await Promise.all(
      doctors.map(async (d) => {
        // Reports may also be opened for past days.
        const [override] = await db.query(
          'SELECT * FROM schedules WHERE doctor_id=$1 AND date=$2',
          [d.id, date],
        );
        const off = override
          ? override.day_off
          : new Date(`${date}T12:00:00+05:00`).getUTCDay() === 0;
        const start = minutes(override?.start_time || '09:00'),
          end = minutes(override?.end_time || '18:00');
        let slots = 0;
        for (let t = start; !off && t < end; t += 30) if (t < 780 || t >= 840) slots++;
        return {
          doctorId: d.id,
          capacity: slots,
          booked: rows.filter((r) => r.doctor_id === d.id && r.status !== 'cancelled').length,
        };
      }),
    );
    res.json({
      total: rows.length,
      scheduled: rows.filter((r) => r.status === 'scheduled').length,
      arrived: rows.filter((r) => ['arrived', 'completed'].includes(r.status)).length,
      noShow: rows.filter((r) => r.status === 'no_show').length,
      completedValue: rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.price, 0),
      capacity,
    });
  });
  app.get('/api/staff/notifications', requireRoles('receptionist', 'admin'), async (_req, res) => {
    const rows = await db.query(
      'SELECT id,booking_id,kind,channel,status,attempts,due_at,last_error,sent_at FROM notifications ORDER BY due_at DESC LIMIT 200',
    );
    res.json({ notifications: rows });
  });
  app.get('/api/staff/audit', requireRoles('lawyer', 'admin'), async (req, res) => {
    const { before, action } = z
      .object({ before: z.string().datetime().optional(), action: z.string().max(80).optional() })
      .parse(req.query);
    const rows = await db.query(
      'SELECT * FROM audit WHERE (CAST($1 AS TEXT) IS NULL OR created_at<$1) AND (CAST($2 AS TEXT) IS NULL OR action=$2) ORDER BY created_at DESC,id DESC LIMIT 200',
      [before || null, action || null],
    );
    res.json({ entries: rows.map((r) => ({ ...r, details: JSON.parse(r.details) })) });
  });
  app.get('/metrics', async (req, res) => {
    if (!config.metricsToken || req.headers.authorization !== `Bearer ${config.metricsToken}`)
      return res.sendStatus(403);
    res.set('Content-Type', registry.contentType).send(await registry.metrics());
  });
  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'NOT_FOUND');
  });
  const dist = path.resolve('dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('/{*path}', (_req, res) =>
      res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html')),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', fields: error.issues.map((i) => i.path.join('.')) });
    if (error.status && error.code) return res.status(error.status).json({ error: error.code });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'INVALID_JSON' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    if (error.code === '23505' || /UNIQUE constraint failed: bookings/.test(error.message))
      return res.status(409).json({ error: 'SLOT_UNAVAILABLE' });
    console.error('Request failed', { code: error.code || error.name });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  return { app, crypto, registry, origins };
}
function serializeBooking(b, crypto) {
  return {
    id: b.id,
    reference: b.reference,
    patientId: b.patient_id,
    doctorId: b.doctor_id,
    serviceId: b.service_id,
    date: b.date,
    time: b.time,
    name: crypto.decrypt(b.name_enc),
    phone: crypto.decrypt(b.phone_enc),
    status: b.status,
    price: b.price,
    notify: Boolean(b.notify),
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}
