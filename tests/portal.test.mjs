import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, bookingBody } from './helpers.mjs';
import { createCrypto } from '../backend/crypto.mjs';
import { loadConfig } from '../backend/config.mjs';
import { addDays, dateSchema, phoneSchema, localDate } from '../backend/booking.mjs';

test('date and phone validation uses clinic timezone and rejects invalid calendar dates', () => {
  assert.equal(phoneSchema.parse('700 111-11-11'), '+77001111111');
  assert.equal(phoneSchema.safeParse('+7<script>').success, false);
  assert.equal(dateSchema.safeParse('2026-02-30').success, false);
  assert.equal(dateSchema.safeParse('2028-02-29').success, true);
  assert.equal(localDate(new Date('2026-10-22T20:00:00Z')), '2026-10-23');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('AES-GCM has randomized ciphertext and detects tampering', () => {
  const crypto = createCrypto({ encryptionKey: 'aa'.repeat(32), pepper: 'bb'.repeat(32) });
  const first = crypto.encrypt('Synthetic Patient');
  assert.notEqual(first, crypto.encrypt('Synthetic Patient'));
  assert.equal(crypto.decrypt(first), 'Synthetic Patient');
  const parts = first.split('.');
  const payload = Buffer.from(parts[2], 'base64url');
  payload[0] ^= 1;
  parts[2] = payload.toString('base64url');
  assert.throws(() => crypto.decrypt(parts.join('.')));
});
test('production refuses missing infrastructure and insecure defaults', () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        DATA_ENCRYPTION_KEY: 'aa'.repeat(32),
        AUTH_PEPPER: 'bb'.repeat(32),
      }),
    /PostgreSQL/,
  );
});
test('public catalog, input validation, origin protection and authenticated booking', async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal((await f.request('/catalog')).body.services.length, 6);
  assert.equal((await f.request('/slots?doctorId=aida&date=2026-02-30')).status, 400);
  assert.equal(
    (await f.request('/bookings', { method: 'POST', body: bookingBody(f.date) })).status,
    401,
  );
  assert.equal(
    (
      await f.request('/auth/request', {
        method: 'POST',
        body: { phone: '+77001111111' },
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  const patient = await f.login();
  assert.match(patient.headers.get('set-cookie'), /HttpOnly/);
  assert.match(patient.headers.get('set-cookie'), /SameSite=Strict/);
  const created = await f.request('/bookings', {
    method: 'POST',
    cookie: patient.cookie,
    body: bookingBody(f.date),
  });
  assert.equal(created.status, 201);
  assert.match(created.body.reference, /^DL-/);
  const [stored] = await f.db.query('SELECT * FROM bookings WHERE id=$1', [created.body.id]);
  assert.notEqual(stored.name_enc, 'Synthetic Test Patient');
  assert.equal(f.crypto.decrypt(stored.name_enc), 'Synthetic Test Patient');
  const atRest = JSON.stringify(await f.db.query('SELECT * FROM users')).concat(
    JSON.stringify(stored),
  );
  assert.equal(atRest.includes('+77001111111'), false);
  assert.equal(atRest.includes('Synthetic Test Patient'), false);
  assert.equal(
    (await f.request(`/bookings/${created.body.id}`, { cookie: patient.cookie })).status,
    200,
  );
  const other = await f.login('+77002222222');
  assert.equal(
    (await f.request(`/bookings/${created.body.id}`, { cookie: other.cookie })).status,
    404,
  );
  assert.equal(
    (
      await f.request(`/bookings/${created.body.id}`, {
        method: 'PATCH',
        cookie: patient.cookie,
        body: { status: 'cancelled' },
      })
    ).status,
    404,
  );
  const slots = await f.request(`/slots?doctorId=aida&date=${f.date}`);
  assert.equal(slots.body.slots.find((s) => s.time === '10:00').available, false);
  assert.equal(
    slots.body.slots.some((s) => s.time === '13:00'),
    false,
  );
  const invalid = await f.request('/bookings', {
    method: 'POST',
    cookie: patient.cookie,
    body: { ...bookingBody(f.date, '10:30'), serviceId: 'implantation' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    (
      await f.request('/bookings', {
        method: 'POST',
        cookie: patient.cookie,
        body: { ...bookingBody(f.date, '10:30'), consent: false },
      })
    ).status,
    400,
  );
  await f.request('/auth/logout', { method: 'POST', cookie: patient.cookie, body: {} });
  assert.equal((await f.request('/me', { cookie: patient.cookie })).body.user, null);
});
test('OTP is single-use, expires and locks after three wrong attempts; sixth request is limited', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const phone = '+77001111111';
  let challenge = (await f.request('/auth/request', { method: 'POST', body: { phone } })).body;
  for (let i = 0; i < 3; i++) {
    const wrong = challenge.demoCode === '000000' ? '000001' : '000000';
    assert.equal(
      (
        await f.request('/auth/verify', {
          method: 'POST',
          body: { phone, challengeId: challenge.challengeId, code: wrong },
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await f.request('/auth/verify', {
        method: 'POST',
        body: { phone, challengeId: challenge.challengeId, code: challenge.demoCode },
      })
    ).status,
    400,
  );
  challenge = (await f.request('/auth/request', { method: 'POST', body: { phone } })).body;
  const verified = await f.request('/auth/verify', {
    method: 'POST',
    body: { phone, challengeId: challenge.challengeId, code: challenge.demoCode, role: 'admin' },
  });
  assert.equal(verified.body.user.role, 'patient');
  assert.equal(
    (
      await f.request('/auth/verify', {
        method: 'POST',
        body: { phone, challengeId: challenge.challengeId, code: challenge.demoCode },
      })
    ).status,
    400,
  );
  await f.db.query('UPDATE sessions SET expires_at=$1', ['2000-01-01T00:00:00.000Z']);
  assert.equal((await f.request('/me', { cookie: verified.cookie })).body.user, null);
  challenge = (await f.request('/auth/request', { method: 'POST', body: { phone } })).body;
  await f.db.query('UPDATE otp_challenges SET expires_at=$1 WHERE id=$2', [
    '2000-01-01T00:00:00.000Z',
    challenge.challengeId,
  ]);
  assert.equal(
    (
      await f.request('/auth/verify', {
        method: 'POST',
        body: { phone, challengeId: challenge.challengeId, code: challenge.demoCode },
      })
    ).status,
    400,
  );
  await f.request('/auth/request', { method: 'POST', body: { phone: '+77002222222' } });
  await f.request('/auth/request', { method: 'POST', body: { phone: '+77003333333' } });
  assert.equal(
    (await f.request('/auth/request', { method: 'POST', body: { phone: '+77004444444' } })).status,
    429,
  );
});
test('twenty pairs racing for one slot produce exactly one success per pair', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login();
  const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [patient.body.user.id]);
  const { createBooking } = await import('../backend/booking.mjs');
  for (let i = 1; i <= 20; i++) {
    let date = addDays(f.date, i);
    if (new Date(`${date}T12:00:00+05:00`).getUTCDay() === 0) date = addDays(date, 1);
    // Alternate times when Sunday and Monday map to the same date.
    const input = bookingBody(date, i % 2 ? '10:00' : '10:30');
    const results = await Promise.allSettled([
      createBooking(f.db, f.crypto, user, input),
      createBooking(f.db, f.crypto, user, input),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'SLOT_UNAVAILABLE');
  }
  const duplicates = await f.db.query(
    "SELECT doctor_id,date,time,COUNT(*) AS count FROM bookings WHERE status<>'cancelled' GROUP BY doctor_id,date,time HAVING COUNT(*)>1",
  );
  assert.equal(duplicates.length, 0);
});
test('five roles enforce data boundaries, audit is immutable, receptionist can undo and reschedule', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login(),
    receptionist = await f.login('+77000000001'),
    doctor = await f.login('+77000000002'),
    lawyer = await f.login('+77000000003'),
    admin = await f.login('+77000000004');
  const first = await f.request('/bookings', {
    method: 'POST',
    cookie: patient.cookie,
    body: bookingBody(f.date),
  });
  const second = await f.request('/bookings', {
    method: 'POST',
    cookie: patient.cookie,
    body: { ...bookingBody(f.date, '11:00'), doctorId: 'arman' },
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const daily = `/staff/bookings?date=${f.date}`;
  assert.equal((await f.request(daily, { cookie: patient.cookie })).status, 403);
  assert.equal((await f.request(daily, { cookie: lawyer.cookie })).status, 403);
  assert.equal((await f.request(daily, { cookie: admin.cookie })).status, 403);
  const own = await f.request(daily, { cookie: doctor.cookie });
  assert.equal(own.body.bookings.length, 1);
  assert.equal(own.body.bookings[0].doctorId, 'aida');
  const receptionList = await f.request(daily, { cookie: receptionist.cookie });
  assert.equal(receptionList.body.bookings.length, 2);
  const b = receptionList.body.bookings.find((b) => b.id === first.body.id);
  assert.equal(
    (
      await f.request(`/staff/bookings/${b.id}`, {
        method: 'PATCH',
        cookie: doctor.cookie,
        body: { status: 'arrived', expectedUpdatedAt: b.updatedAt },
      })
    ).status,
    403,
  );
  let updated = await f.request(`/staff/bookings/${b.id}`, {
    method: 'PATCH',
    cookie: receptionist.cookie,
    body: { status: 'arrived', expectedUpdatedAt: b.updatedAt },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, 'arrived');
  assert.equal(
    (
      await f.request(`/staff/bookings/${b.id}`, {
        method: 'PATCH',
        cookie: receptionist.cookie,
        body: { status: 'no_show', expectedUpdatedAt: b.updatedAt },
      })
    ).status,
    409,
  );
  updated = await f.request(`/staff/bookings/${b.id}`, {
    method: 'PATCH',
    cookie: receptionist.cookie,
    body: { status: 'scheduled', expectedUpdatedAt: updated.body.updatedAt },
  });
  assert.equal(updated.status, 200);
  updated = await f.request(`/staff/bookings/${b.id}`, {
    method: 'PATCH',
    cookie: receptionist.cookie,
    body: { date: f.date, time: '11:30', expectedUpdatedAt: updated.body.updatedAt },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.time, '11:30');
  const scheduleBody = {
    doctorId: 'aida',
    date: f.date,
    start: '09:00',
    end: '18:00',
    dayOff: true,
  };
  assert.equal(
    (
      await f.request('/staff/schedules', {
        method: 'PUT',
        cookie: receptionist.cookie,
        body: scheduleBody,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request('/staff/schedules', {
        method: 'PUT',
        cookie: doctor.cookie,
        body: scheduleBody,
      })
    ).status,
    403,
  );
  const stats = (
    await f.request(`/staff/statistics?date=${f.date}`, { cookie: receptionist.cookie })
  ).body;
  assert.equal(stats.total, 2);
  assert.equal(stats.capacity.find((d) => d.doctorId === 'aida').booked, 1);
  updated = await f.request(`/staff/bookings/${b.id}`, {
    method: 'PATCH',
    cookie: receptionist.cookie,
    body: { status: 'cancelled', expectedUpdatedAt: updated.body.updatedAt },
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (
      await f.request('/staff/schedules', {
        method: 'PUT',
        cookie: receptionist.cookie,
        body: scheduleBody,
      })
    ).status,
    200,
  );
  assert.equal((await f.request(`/slots?doctorId=aida&date=${f.date}`)).body.slots.length, 0);
  const audit = await f.request('/staff/audit', { cookie: lawyer.cookie });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.entries.length >= 10);
  assert.equal(JSON.stringify(audit.body).includes('Synthetic Test Patient'), false);
  assert.equal((await f.request('/staff/audit', { cookie: patient.cookie })).status, 403);
  await assert.rejects(f.db.query("UPDATE audit SET action='tampered'"), /immutable/);
  await assert.rejects(f.db.query('DELETE FROM audit'), /immutable/);
  const stored = await f.db.query('SELECT * FROM notifications WHERE booking_id=$1', [b.id]);
  assert.ok(stored.length > 0);
  assert.equal(
    stored.some((n) => ['pending', 'sending'].includes(n.status)),
    false,
  );
});
test('SQLite dev data persists across restarts', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'dentlux-persist-'));
  const config = loadConfig({ DATA_DIR: dir });
  const { openDatabase } = await import('../backend/db.mjs');
  try {
    let db = await openDatabase(config);
    await db.query(
      'INSERT INTO audit(id,actor_id,action,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(), 'system', 'test', 'persist', '{}', new Date().toISOString()],
    );
    await db.close();
    db = await openDatabase(loadConfig({ DATA_DIR: dir }));
    assert.equal((await db.query("SELECT * FROM audit WHERE entity_id='persist'")).length, 1);
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
