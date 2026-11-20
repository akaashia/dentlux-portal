import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, bookingBody } from './helpers.mjs';
import { parseCsv, importBookings } from '../backend/import.mjs';
import { addDays, getSlots } from '../backend/booking.mjs';
test('CSV supports quoted fields, CRLF, BOM and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFname,note\r\n"A, B","Line 1\nLine ""2"""\r\n'), [
    { name: 'A, B', note: 'Line 1\nLine "2"' },
  ]);
  assert.throws(() => parseCsv('a,b\n"unfinished'));
  assert.throws(() => parseCsv('a,a\n1,2'));
});
test('100 bookings match the import input and a conflicting batch rolls back', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const candidates = [];
  for (let offset = 0; offset < 10; offset++) {
    const date = addDays(f.date, offset);
    const { slots } = await getSlots(f.db, 'aida', date);
    for (const { time } of slots.filter((slot) => slot.available)) {
      const phone = '+7700555' + String(candidates.length).padStart(4, '0');
      candidates.push({ ...bookingBody(date, time), phone });
    }
  }
  assert.ok(candidates.length >= 101);
  const rows = candidates.slice(0, 100);
  const extra = candidates[100];
  const preview = await importBookings(f.db, f.crypto, rows);
  assert.equal(preview.input, 100);
  assert.equal(preview.validated, 100);
  assert.equal(preview.committed, 0);
  assert.equal((await f.db.query('SELECT * FROM bookings')).length, 0);
  const applied = await importBookings(f.db, f.crypto, rows, { dryRun: false });
  assert.equal(applied.input, 100);
  assert.equal(applied.committed, 100);
  assert.equal((await f.db.query('SELECT * FROM bookings')).length, 100);
  await assert.rejects(importBookings(f.db, f.crypto, [extra, rows[0]], { dryRun: false }), {
    code: 'SLOT_UNAVAILABLE',
  });
  assert.equal((await f.db.query('SELECT * FROM bookings')).length, 100);
  assert.equal(
    (await f.db.query('SELECT * FROM users WHERE phone_hash=$1', [f.crypto.hash(extra.phone)]))
      .length,
    0,
  );
});
