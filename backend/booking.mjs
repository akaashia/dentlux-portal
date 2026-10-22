import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { doctors, services } from './catalog.mjs';

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00+05:00`);
    return Number.isFinite(+date) && localDate(date) === value;
  });
export const timeSchema = z.string().regex(/^(?:0\d|1\d|2[0-3]):(?:00|30)$/);
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .transform((value) => (/^\d{10}$/.test(value) ? `+7${value}` : value))
  .pipe(z.string().regex(/^\+7\d{10}$/));
const clinicDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Almaty',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function localDate(date = new Date()) {
  return clinicDateFormatter.format(date);
}
export function addDays(date, days) {
  return localDate(new Date(+new Date(`${date}T00:00:00+05:00`) + days * 86400000));
}
export function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function clock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function validateHorizon(date) {
  dateSchema.parse(date);
  if (date < localDate() || date > addDays(localDate(), 60))
    throw new HttpError(400, 'DATE_OUT_OF_RANGE');
}
export async function audit(tx, actor, action, entity, details = {}) {
  await tx.query(
    'INSERT INTO audit(id,actor_id,action,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), actor, action, entity, JSON.stringify(details), new Date().toISOString()],
  );
}
export async function scheduleFor(tx, doctorId, date) {
  const [override] = await tx.query('SELECT * FROM schedules WHERE doctor_id=$1 AND date=$2', [
    doctorId,
    date,
  ]);
  const sunday = new Date(`${date}T12:00:00+05:00`).getUTCDay() === 0;
  return (
    override || {
      doctor_id: doctorId,
      date,
      start_time: '09:00',
      end_time: '18:00',
      day_off: Number(sunday),
    }
  );
}
export async function getSlots(tx, doctorId, date) {
  if (!doctors.some((d) => d.id === doctorId)) throw new HttpError(404, 'DOCTOR_NOT_FOUND');
  validateHorizon(date);
  const schedule = await scheduleFor(tx, doctorId, date);
  const bookings = await tx.query(
    "SELECT time FROM bookings WHERE doctor_id=$1 AND date=$2 AND status <> 'cancelled'",
    [doctorId, date],
  );
  const occupied = new Set(bookings.map((b) => b.time));
  const slots = [];
  if (!schedule.day_off)
    for (let t = minutes(schedule.start_time); t < minutes(schedule.end_time); t += 30) {
      const time = clock(t);
      if (t >= 13 * 60 && t < 14 * 60) continue;
      if (+new Date(`${date}T${time}:00+05:00`) <= Date.now()) continue;
      slots.push({ time, available: !occupied.has(time) });
    }
  return { date, doctorId, schedule, slots };
}
export async function lockDoctor(tx, doctorId) {
  const rows = await tx.query(
    `SELECT id FROM doctors WHERE id=$1${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
    [doctorId],
  );
  if (!rows.length) throw new HttpError(404, 'DOCTOR_NOT_FOUND');
}
export async function enqueueNotifications(tx, booking) {
  if (!booking.notify || booking.status !== 'scheduled') return;
  const reminderAt = new Date(
    +new Date(`${booking.date}T${booking.time}:00+05:00`) - 2 * 3600000,
  ).toISOString();
  const now = new Date().toISOString();
  for (const kind of ['confirmation', 'reminder']) {
    // A booking less than two hours away gets a confirmation only.
    if (kind === 'reminder' && reminderAt <= now) continue;
    const versionedKind = `${kind}:${booking.updated_at || booking.created_at}`;
    await tx.query(
      `INSERT INTO notifications(id,booking_id,kind,channel,due_at) VALUES($1,$2,$3,'sms',$4)
      ON CONFLICT(booking_id,kind,channel) DO NOTHING`,
      [randomUUID(), booking.id, versionedKind, kind === 'confirmation' ? now : reminderAt],
    );
    const [link] = await tx.query('SELECT user_id FROM telegram_links WHERE user_id=$1', [
      booking.patient_id,
    ]);
    if (link)
      await tx.query(
        `INSERT INTO notifications(id,booking_id,kind,channel,due_at) VALUES($1,$2,$3,'telegram',$4)
      ON CONFLICT(booking_id,kind,channel) DO NOTHING`,
        [randomUUID(), booking.id, versionedKind, kind === 'confirmation' ? now : reminderAt],
      );
  }
}
export const bookingSchema = z.object({
  doctorId: z.string(),
  serviceId: z.string(),
  date: dateSchema,
  time: timeSchema,
  name: z.string().trim().min(2).max(100),
  consent: z.literal(true),
  notify: z.boolean().default(false),
});
export async function createBooking(db, crypto, user, input) {
  return db.transaction((tx) => createBookingInTransaction(tx, crypto, user, input));
}
export async function createBookingInTransaction(tx, crypto, user, input) {
  const data = bookingSchema.parse(input);
  const doctor = doctors.find((d) => d.id === data.doctorId);
  const service = services.find((s) => s.id === data.serviceId);
  if (!doctor || !service || !doctor.services.includes(service.id))
    throw new HttpError(400, 'INVALID_SERVICE');
  await lockDoctor(tx, doctor.id);
  const { slots } = await getSlots(tx, doctor.id, data.date);
  if (!slots.some((s) => s.time === data.time && s.available))
    throw new HttpError(409, 'SLOT_UNAVAILABLE');
  const now = new Date().toISOString();
  const booking = {
    id: randomUUID(),
    reference: `DL-${randomBytes(5).toString('hex').toUpperCase()}`,
    patient_id: user.id,
    doctor_id: doctor.id,
    service_id: service.id,
    date: data.date,
    time: data.time,
    name_enc: crypto.encrypt(data.name),
    phone_enc: user.phone_enc,
    price: service.price,
    notify: Number(data.notify),
    status: 'scheduled',
    created_at: now,
  };
  await tx.query(
    `INSERT INTO bookings(id,reference,patient_id,doctor_id,service_id,date,time,status,name_enc,phone_enc,price,consent_version,consent_at,notify,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
    [
      booking.id,
      booking.reference,
      user.id,
      doctor.id,
      service.id,
      data.date,
      data.time,
      'scheduled',
      booking.name_enc,
      user.phone_enc,
      service.price,
      '2026-10-22-v1',
      now,
      booking.notify,
      now,
    ],
  );
  await audit(tx, user.id, 'booking.created', booking.id, {
    doctorId: doctor.id,
    date: data.date,
    time: data.time,
  });
  await enqueueNotifications(tx, booking);
  return {
    id: booking.id,
    reference: booking.reference,
    doctorId: doctor.id,
    serviceId: service.id,
    date: data.date,
    time: data.time,
    price: service.price,
    status: 'scheduled',
  };
}
