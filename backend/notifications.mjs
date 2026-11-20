import { randomBytes } from 'node:crypto';
import { audit, enqueueNotifications, localDate } from './booking.mjs';

const telegramMessages = {
  ru: {
    linked: 'Уведомления DentLux подключены.',
    expired: 'Ссылка устарела. Откройте новую ссылку на сайте DentLux.',
    help: 'Чтобы получать уведомления, запишитесь на сайте DentLux и выберите Telegram на экране подтверждения.',
  },
  kk: {
    linked: 'DentLux хабарламалары қосылды.',
    expired: 'Сілтеменің мерзімі бітті. DentLux сайтында жаңа сілтеме алыңыз.',
    help: 'Хабарлама алу үшін DentLux сайтында жазылып, растау экранында Telegram таңдаңыз.',
  },
};

export async function sendSms(config, phone, text, idempotencyKey) {
  if (config.demo) return 'demo';
  const response = await fetch(config.smsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.smsToken}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ to: phone, text, idempotencyKey }),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error(`SMS_HTTP_${response.status}`);
  return 'sent';
}
async function telegramRequest(config, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error('TELEGRAM_UNAVAILABLE');
  const data = await response.json();
  if (!data?.ok) throw new Error('TELEGRAM_UNAVAILABLE');
  return data.result;
}

function sendTelegram(config, chatId, text) {
  return telegramRequest(config, 'sendMessage', { chat_id: chatId, text });
}
export async function processOutbox(db, config, crypto, now = new Date()) {
  const candidates = await db.query(
    `SELECT id FROM notifications WHERE
    (status='pending' AND due_at<=$1) OR (status='sending' AND lease_until<$1) ORDER BY due_at LIMIT 50`,
    [now.toISOString()],
  );
  for (const candidate of candidates) {
    const [notification] = await db.query(
      `UPDATE notifications SET status='sending', lease_until=$2 WHERE id=$1 AND
      ((status='pending' AND due_at<=$3) OR (status='sending' AND lease_until<$3)) RETURNING *`,
      [candidate.id, new Date(+now + 30000).toISOString(), now.toISOString()],
    );
    if (!notification) continue;
    const [booking] = await db.query('SELECT * FROM bookings WHERE id=$1', [
      notification.booking_id,
    ]);
    if (!booking?.notify || booking.status !== 'scheduled') {
      await db.query("UPDATE notifications SET status='cancelled',lease_until=NULL WHERE id=$1", [
        notification.id,
      ]);
      continue;
    }
    try {
      const text = `DentLux: ${booking.date} ${booking.time} (UTC+5). ${config.publicUrl}`;
      let status = 'demo';
      if (notification.channel === 'sms')
        status = await sendSms(config, crypto.decrypt(booking.phone_enc), text, notification.id);
      else if (config.telegramToken) {
        const [link] = await db.query('SELECT chat_id_enc FROM telegram_links WHERE user_id=$1', [
          booking.patient_id,
        ]);
        if (!link) throw new Error('TELEGRAM_UNLINKED');
        const purpose = notification.kind.startsWith('reminder:')
          ? 'Напоминание о приёме'
          : 'Запись подтверждена';
        await sendTelegram(config, crypto.decrypt(link.chat_id_enc), `${purpose}\n${text}`);
        status = 'sent';
      } else if (!config.demo) throw new Error('TELEGRAM_UNAVAILABLE');
      await db.query(
        'UPDATE notifications SET status=$2,attempts=attempts+1,sent_at=$3,lease_until=NULL,last_error=NULL WHERE id=$1',
        [notification.id, status, new Date().toISOString()],
      );
    } catch (error) {
      const attempts = notification.attempts + 1;
      // Keep provider responses and personal data out of logs and error fields.
      const code = error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILED';
      await db.query(
        'UPDATE notifications SET status=$2,attempts=$3,last_error=$4,due_at=$5,lease_until=NULL WHERE id=$1',
        [
          notification.id,
          attempts >= 3 ? 'failed' : 'pending',
          attempts,
          code,
          new Date(+now + attempts * 60000).toISOString(),
        ],
      );
      if (attempts >= 3)
        await audit(db, 'system', 'notification.failed', notification.id, {
          channel: notification.channel,
        });
    }
  }
}
export async function createTelegramLink(db, config, crypto, userId) {
  if (!config.telegramToken) return { available: false };
  const bot = await telegramRequest(config, 'getMe');
  if (!bot?.is_bot || !bot.username) throw new Error('TELEGRAM_UNAVAILABLE');
  const token = randomBytes(24).toString('hex');
  await db.query('INSERT INTO telegram_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
    crypto.hash(token),
    userId,
    new Date(Date.now() + 5 * 60000).toISOString(),
  ]);
  return { available: true, url: `https://t.me/${bot.username}?start=${token}` };
}
export async function linkTelegramAccount(db, crypto, rawToken, chatId) {
  return db.transaction(async (tx) => {
    const [token] = await tx.query(
      'DELETE FROM telegram_tokens WHERE token_hash=$1 AND expires_at>$2 RETURNING *',
      [crypto.hash(rawToken), new Date().toISOString()],
    );
    if (!token) return false;
    await tx.query(
      'INSERT INTO telegram_links(user_id,chat_id_enc) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET chat_id_enc=$2',
      [token.user_id, crypto.encrypt(chatId)],
    );
    const bookings = await tx.query(
      "SELECT * FROM bookings WHERE patient_id=$1 AND date>=$2 AND status='scheduled' AND notify=1",
      [token.user_id, localDate()],
    );
    for (const booking of bookings)
      if (+new Date(`${booking.date}T${booking.time}:00+05:00`) > Date.now())
        await enqueueNotifications(tx, booking);
    await audit(tx, token.user_id, 'telegram.linked', token.user_id);
    return true;
  });
}

async function handleTelegramMessage(db, config, crypto, message) {
  if (message?.chat?.type !== 'private' || typeof message.text !== 'string') return;
  const [command, code, extra] = message.text.trim().split(/\s+/);
  if (!['/start', '/help'].includes(command)) return;
  const chatId = message.chat.id;
  const messages = message.from?.language_code?.startsWith('kk')
    ? telegramMessages.kk
    : telegramMessages.ru;
  let reply = `${messages.help}\n${config.publicUrl}`;

  if (command === '/start' && !extra && /^[a-f0-9]{48}$/.test(code || '')) {
    const linked = await linkTelegramAccount(db, crypto, code, chatId);
    reply = linked ? messages.linked : messages.expired;
  }

  try {
    await sendTelegram(config, chatId, reply);
  } catch {
    console.error('Could not send a Telegram reply');
  }
}

export function startWorkers(db, config, crypto) {
  let running = false,
    stopped = false,
    offset = 0;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await processOutbox(db, config, crypto);
      await db.query('DELETE FROM sessions WHERE expires_at<$1', [new Date().toISOString()]);
      await db.query('DELETE FROM otp_challenges WHERE expires_at<$1', [
        new Date(Date.now() - 86400000).toISOString(),
      ]);
      await db.query('DELETE FROM telegram_tokens WHERE expires_at<$1', [new Date().toISOString()]);
      if (config.telegramToken) {
        const updates = await telegramRequest(config, 'getUpdates', {
          offset,
          timeout: 0,
          allowed_updates: ['message'],
        });
        for (const update of updates) {
          await handleTelegramMessage(db, config, crypto, update.message);
          offset = update.update_id + 1;
        }
      }
    } catch {
      console.error('Background worker failed; retrying on next interval');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 20));
  };
}
