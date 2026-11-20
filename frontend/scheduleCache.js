const key = 'dentlux-staff-schedule';
const maxAgeMs = 30 * 60 * 1000;

function recentDays(account) {
  try {
    const snapshot = JSON.parse(sessionStorage.getItem(key));
    if (snapshot?.account === account && Array.isArray(snapshot.days)) {
      return snapshot.days.filter(
        (day) =>
          Number.isFinite(day?.savedAt) &&
          Date.now() - day.savedAt < maxAgeMs &&
          Array.isArray(day.rows),
      );
    }
  } catch {
    return [];
  }
  return [];
}

export function saveSchedule(account, date, bookings) {
  const rows = bookings.map(({ time, doctorId, status }) => ({ time, doctorId, status }));
  const days = recentDays(account)
    .filter((day) => day.date !== date)
    .slice(0, 6);
  days.unshift({ date, savedAt: Date.now(), rows });
  try {
    sessionStorage.setItem(key, JSON.stringify({ account, days }));
  } catch {
    return;
  }
}

export function readSchedule(account, date) {
  return recentDays(account).find((day) => day.date === date)?.rows ?? null;
}

export function clearSchedule() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}
