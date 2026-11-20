import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, bookingBody } from './helpers.mjs';
import { createBooking } from '../backend/booking.mjs';
import { loadConfig } from '../backend/config.mjs';
import { processOutbox, linkTelegramAccount, startWorkers } from '../backend/notifications.mjs';

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

test('a loopback demo can use the Telegram Bot API while SMS remains simulated', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const patient = await f.login();
  const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [patient.body.user.id]);
  const booking = await createBooking(f.db, f.crypto, user, bookingBody(f.date));
  const env = { DATA_DIR: f.config.dataDir, TELEGRAM_BOT_TOKEN: '100001:synthetic' };
  assert.equal(loadConfig(env).telegramToken, undefined);
  f.config.telegramToken = loadConfig({ ...env, TELEGRAM_LIVE_IN_DEMO: 'true' }).telegramToken;

  const messages = [];
  const updates = [];
  const request = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!url.startsWith('https://api.telegram.org/')) return request(url, options);
    if (url.endsWith('/getMe'))
      return Response.json({ ok: true, result: { is_bot: true, username: 'DentLuxExampleBot' } });
    if (url.endsWith('/getUpdates')) return Response.json({ ok: true, result: updates });
    assert.ok(url.endsWith('/sendMessage'));
    messages.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: messages.length } });
  });

  const response = await f.request('/telegram/link', { method: 'POST', cookie: patient.cookie });
  assert.equal(response.status, 200);
  const link = new URL(response.body.url);
  assert.equal(link.pathname, '/DentLuxExampleBot');
  const code = link.searchParams.get('start');
  updates.push(
    { update_id: 1, message: { chat: { id: -100, type: 'group' }, text: `/start ${code}` } },
    { update_id: 2, message: { chat: { id: 123, type: 'private' }, text: `/start ${code}` } },
  );
  const stop = startWorkers(f.db, f.config, f.crypto);
  await stop();
  await processOutbox(f.db, f.config, f.crypto);

  const [reminder] = await f.db.query(
    "SELECT due_at FROM notifications WHERE booking_id=$1 AND channel='telegram' AND kind LIKE 'reminder:%'",
    [booking.id],
  );
  await processOutbox(f.db, f.config, f.crypto, new Date(reminder.due_at));
  assert.deepEqual(
    messages.map(({ chat_id, text }) => [String(chat_id), text.split('\n')[0]]),
    [
      ['123', 'Уведомления DentLux подключены.'],
      ['123', 'Запись подтверждена'],
      ['123', 'Напоминание о приёме'],
    ],
  );
  const outcomes = await f.db.query(
    'SELECT channel,status FROM notifications WHERE booking_id=$1',
    [booking.id],
  );
  assert.deepEqual(
    outcomes.filter((row) => row.channel === 'telegram').map((row) => row.status),
    ['sent', 'sent'],
  );
  assert.ok(outcomes.filter((row) => row.channel === 'sms').every((row) => row.status === 'demo'));
});
