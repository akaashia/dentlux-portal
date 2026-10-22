CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS doctors (id TEXT PRIMARY KEY, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL UNIQUE, phone_enc TEXT NOT NULL,
  name_enc TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('patient','receptionist','doctor','lawyer','admin')),
  doctor_id TEXT REFERENCES doctors(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS otp_phone ON otp_challenges(phone_hash);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedules (
  doctor_id TEXT NOT NULL REFERENCES doctors(id), date TEXT NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL, day_off INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(doctor_id, date)
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, patient_id TEXT NOT NULL REFERENCES users(id),
  doctor_id TEXT NOT NULL REFERENCES doctors(id), service_id TEXT NOT NULL REFERENCES services(id),
  date TEXT NOT NULL, time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','arrived','completed','no_show','cancelled')),
  name_enc TEXT NOT NULL, phone_enc TEXT NOT NULL, price INTEGER NOT NULL,
  consent_version TEXT NOT NULL, consent_at TEXT NOT NULL, notify INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_active_slot ON bookings(doctor_id,date,time) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS booking_date ON bookings(date,time);
CREATE INDEX IF NOT EXISTS booking_patient ON bookings(patient_id);
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  entity_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id), kind TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms', status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL, lease_until TEXT,
  last_error TEXT, sent_at TEXT, UNIQUE(booking_id,kind,channel)
);
CREATE INDEX IF NOT EXISTS notification_due ON notifications(status,due_at);
CREATE TABLE IF NOT EXISTS telegram_links (user_id TEXT PRIMARY KEY REFERENCES users(id), chat_id_enc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telegram_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
