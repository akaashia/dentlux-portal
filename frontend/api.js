export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(`/api${url}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const error = new Error('NETWORK_ERROR');
    error.code = 'NETWORK_ERROR';
    throw error;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    data = { error: 'INTERNAL_ERROR' };
  }
  if (!response.ok) {
    const error = new Error(data.error);
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data;
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function shiftDate(date, days) {
  return localDate(new Date(+new Date(`${date}T12:00:00+05:00`) + days * 86400000));
}
export function downloadCalendar(booking, service, doctor, locale) {
  const start = new Date(`${booking.date}T${booking.time}:00+05:00`);
  const stamp = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const escape = (value) =>
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/[,;]/g, (m) => `\\${m}`);
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DentLux//Booking//RU',
    'BEGIN:VEVENT',
    `UID:${booking.id}@dentlux`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(new Date(+start + 1800000))}`,
    `SUMMARY:${escape(`DentLux — ${service.name[locale]}`)}`,
    `DESCRIPTION:${escape(`${doctor.name[locale]} · ${booking.reference}`)}`,
    `LOCATION:${escape('Астана, Мәңгілік Ел, 26')}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${booking.reference}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
