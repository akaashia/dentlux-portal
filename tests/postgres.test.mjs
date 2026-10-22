import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, bookingBody } from './helpers.mjs';
import { createBooking, addDays } from '../backend/booking.mjs';

test(
  'PostgreSQL transactions, uniqueness, rollback and immutable audit',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    // Dedicated disposable database ONLY: CI creates it specifically for this suite.
    const f = await fixture(process.env.TEST_DATABASE_URL);
    t.after(f.close);
    const phone = `+7700${String(Date.now()).slice(-7)}`;
    const userLogin = await f.login(phone);
    const [user] = await f.db.query('SELECT * FROM users WHERE id=$1', [userLogin.body.user.id]);
    let pairs = 0;
    for (let i = 0; pairs < 20; i++) {
      const date = addDays(f.date, i);
      if (new Date(`${date}T12:00:00+05:00`).getUTCDay() === 0) continue;
      const results = await Promise.allSettled([
        createBooking(f.db, f.crypto, user, bookingBody(date)),
        createBooking(f.db, f.crypto, user, bookingBody(date)),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      pairs++;
    }
    await assert.rejects(
      f.db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO audit(id,actor_id,action,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',
          [randomUUID(), 'test', 'rollback', 'test', '{}', new Date().toISOString()],
        );
        throw new Error('rollback');
      }),
    );
    assert.equal((await f.db.query("SELECT * FROM audit WHERE action='rollback'")).length, 0);
    await assert.rejects(f.db.query("UPDATE audit SET action='changed'"), /immutable/);
  },
);
