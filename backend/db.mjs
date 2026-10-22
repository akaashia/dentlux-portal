import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { doctors, services } from './catalog.mjs';
import { createCrypto } from './crypto.mjs';

export async function openDatabase(config) {
  let db;
  if (config.databaseUrl) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: config.databaseUrl, max: 15 });
    db = {
      dialect: 'postgres',
      async query(sql, params = []) {
        return (await pool.query(sql, params)).rows;
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx = {
            dialect: 'postgres',
            query: async (sql, params = []) => (await client.query(sql, params)).rows,
          };
          const result = await fn(tx);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async close() {
        await pool.end();
      },
    };
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const sqlite = new DatabaseSync(config.sqlitePath);
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const rawQuery = async (sql, params = []) => {
      const values = [];
      const statement = sqlite.prepare(
        sql.replace(/\$(\d+)/g, (_, n) => {
          values.push(params[Number(n) - 1]);
          return '?';
        }),
      );
      return statement.all(...values);
    };
    // Serialize SQLite reads too: no request may observe another transaction's uncommitted state.
    let tail = Promise.resolve();
    const enqueue = (fn) => {
      const result = tail.then(fn);
      tail = result.catch(() => {});
      return result;
    };
    db = {
      dialect: 'sqlite',
      query: (sql, params) => enqueue(() => rawQuery(sql, params)),
      transaction: (fn) =>
        enqueue(async () => {
          sqlite.exec('BEGIN IMMEDIATE');
          try {
            const result = await fn({ dialect: 'sqlite', query: rawQuery });
            sqlite.exec('COMMIT');
            return result;
          } catch (e) {
            sqlite.exec('ROLLBACK');
            throw e;
          }
        }),
      exec: (sql) => enqueue(() => sqlite.exec(sql)),
      close: async () => {
        await tail;
        sqlite.close();
      },
    };
  }
  await migrate(db);
  await seed(db, config);
  return db;
}

export async function migrate(db) {
  const sql = readFileSync(new URL('./migrations/001-initial.sql', import.meta.url), 'utf8');
  await db.transaction(async (tx) => {
    // All statements in this migration are portable and do not contain embedded semicolons.
    for (const statement of sql.split(';').filter((s) => s.trim())) await tx.query(statement);
    await tx.query(
      'INSERT INTO schema_migrations(version,applied_at) VALUES(1,$1) ON CONFLICT(version) DO NOTHING',
      [new Date().toISOString()],
    );
  });
  if (db.dialect === 'postgres') {
    await db.exec(`CREATE OR REPLACE FUNCTION dentlux_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are immutable'; END; $$;
      DROP TRIGGER IF EXISTS audit_immutable ON audit;
      CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION dentlux_audit_immutable();`);
    await db.exec(`CREATE OR REPLACE FUNCTION dentlux_data_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE row_id text;
      BEGIN
        IF TG_TABLE_NAME = 'schedules' THEN row_id := COALESCE(NEW.doctor_id,OLD.doctor_id);
        ELSE row_id := COALESCE(NEW.id,OLD.id); END IF;
        INSERT INTO audit(id,actor_id,action,entity_id,details,created_at)
        VALUES(gen_random_uuid()::text,'database','db.' || TG_TABLE_NAME || '.' || lower(TG_OP),row_id,'{}',
          to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
        RETURN NULL;
      END; $$;`);
    for (const table of ['users', 'bookings', 'schedules'])
      await db.exec(`DROP TRIGGER IF EXISTS data_audit ON ${table};
      CREATE TRIGGER data_audit AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION dentlux_data_audit();`);
  } else {
    await db.exec(`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;`);
    for (const table of ['users', 'bookings', 'schedules'])
      for (const op of ['insert', 'update', 'delete']) {
        const row = op === 'delete' ? 'OLD' : 'NEW';
        await db.exec(`CREATE TRIGGER IF NOT EXISTS audit_${table}_${op} AFTER ${op.toUpperCase()} ON ${table} BEGIN
        INSERT INTO audit(id,actor_id,action,entity_id,details,created_at) VALUES(lower(hex(randomblob(16))),'database','db.${table}.${op}',${row}.${table === 'schedules' ? 'doctor_id' : 'id'},'{}',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;`);
      }
  }
  await db.query(
    'INSERT INTO schema_migrations(version,applied_at) VALUES(2,$1) ON CONFLICT(version) DO NOTHING',
    [new Date().toISOString()],
  );
}

async function seed(db, config) {
  for (const d of doctors)
    await db.query('INSERT INTO doctors(id,details) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
      d.id,
      JSON.stringify(d),
    ]);
  for (const s of services)
    await db.query('INSERT INTO services(id,details) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
      s.id,
      JSON.stringify(s),
    ]);
  const accounts = config.demo
    ? [
        { phone: '+77000000001', name: 'Демо Регистратор', role: 'receptionist' },
        { phone: '+77000000002', name: 'Демо Врач', role: 'doctor', doctorId: 'aida' },
        { phone: '+77000000003', name: 'Демо Юрист', role: 'lawyer' },
        { phone: '+77000000004', name: 'Демо Админ', role: 'admin' },
      ]
    : config.staff;
  const crypto = createCrypto(config);
  for (const account of accounts) {
    if (
      !/^\+7\d{10}$/.test(account.phone) ||
      !['receptionist', 'doctor', 'lawyer', 'admin'].includes(account.role) ||
      !account.name ||
      (account.role === 'doctor' && !doctors.some((d) => d.id === account.doctorId))
    )
      throw new Error('Invalid STAFF_ACCOUNTS entry');
    await db.query(
      `INSERT INTO users(id,phone_hash,phone_enc,name_enc,role,doctor_id,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(phone_hash) DO NOTHING`,
      [
        randomUUID(),
        crypto.hash(account.phone),
        crypto.encrypt(account.phone),
        crypto.encrypt(account.name),
        account.role,
        account.doctorId || null,
        new Date().toISOString(),
      ],
    );
  }
}
