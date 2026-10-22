import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, bookingBody } from './helpers.mjs';
import { createBooking } from '../backend/booking.mjs';
import { processOutbox, linkTelegramAccount } from '../backend/notifications.mjs';

test('confirmation and two-hour reminder use outbox, lease prevents duplicate workers, opt-out cancels pending work', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login();
  const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [patient.body.user.id]);
  const booking = await createBooking(f.db, f.crypto, user, bookingBody(f.date));
  let rows = await f.db.query('SELECT * FROM notifications WHERE booking_id=$1', [booking.id]);
  assert.equal(rows.length, 2);
  const reminder = rows.find((n) => n.kind.startsWith('reminder:'));
  assert.equal(+new Date(`${f.date}T10:00:00+05:00`) - +new Date(reminder.due_at), 7200000);
  await Promise.all([
    processOutbox(f.db, f.config, f.crypto),
    processOutbox(f.db, f.config, f.crypto),
  ]);
  rows = await f.db.query('SELECT * FROM notifications WHERE booking_id=$1', [booking.id]);
  const confirmation = rows.find((n) => n.kind.startsWith('confirmation:'));
  assert.equal(confirmation.status, 'demo');
  assert.equal(confirmation.attempts, 1);
  const result = await f.request(`/bookings/${booking.id}/notifications`, {
    method: 'PATCH',
    cookie: patient.cookie,
    body: { enabled: false },
  });
  assert.equal(result.status, 200);
  await processOutbox(f.db, f.config, f.crypto, new Date(+new Date(reminder.due_at) + 100));
  const [pending] = await f.db.query('SELECT * FROM notifications WHERE id=$1', [reminder.id]);
  assert.equal(pending.status, 'cancelled');
});
test('provider failure retries three times, creates staff alert, never stores raw provider errors', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login();
  const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [patient.body.user.id]);
  const b = await createBooking(f.db, f.crypto, user, bookingBody(f.date));
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('+77001111111 private provider body');
  };
  try {
    const cfg = { ...f.config, demo: false, smsUrl: 'https://test.invalid', smsToken: 'test' };
    const now = new Date();
    for (let i = 0; i < 3; i++)
      await processOutbox(f.db, cfg, f.crypto, new Date(+now + i * 180000));
    assert.equal(calls, 3);
    const rows = await f.db.query('SELECT * FROM notifications WHERE booking_id=$1', [b.id]);
    const failed = rows.find((n) => n.kind.startsWith('confirmation:'));
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 3);
    assert.equal(failed.last_error, 'PROVIDER_FAILED');
    assert.equal(
      (await f.db.query("SELECT * FROM audit WHERE action='notification.failed'")).length,
      1,
    );
    assert.equal(JSON.stringify(rows).includes('+77001111111'), false);
  } finally {
    globalThis.fetch = original;
  }
});
test('verified Telegram link is single-use and schedules confirmation for an existing future booking', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login();
  const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [patient.body.user.id]);
  const booking = await createBooking(f.db, f.crypto, user, bookingBody(f.date));
  const token = 'a'.repeat(48);
  await f.db.query('INSERT INTO telegram_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
    f.crypto.hash(token),
    user.id,
    new Date(Date.now() + 300000).toISOString(),
  ]);
  assert.equal(await linkTelegramAccount(f.db, f.crypto, token, 'synthetic-chat-id'), true);
  assert.equal(await linkTelegramAccount(f.db, f.crypto, token, 'other-chat-id'), false);
  const [link] = await f.db.query('SELECT * FROM telegram_links WHERE user_id=$1', [user.id]);
  assert.equal(f.crypto.decrypt(link.chat_id_enc), 'synthetic-chat-id');
  const notifications = await f.db.query('SELECT * FROM notifications WHERE booking_id=$1', [
    booking.id,
  ]);
  assert.equal(notifications.filter((n) => n.channel === 'telegram').length, 2);
  assert.equal(notifications.filter((n) => n.channel === 'sms').length, 2);
});
