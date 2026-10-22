import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, bookingBody } from './helpers.mjs';
import { parseCsv, importBookings } from '../backend/import.mjs';
test('CSV supports quoted fields, CRLF, BOM and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFname,note\r\n"A, B","Line 1\nLine ""2"""\r\n'), [
    { name: 'A, B', note: 'Line 1\nLine "2"' },
  ]);
  assert.throws(() => parseCsv('a,b\n"unfinished'));
  assert.throws(() => parseCsv('a,a\n1,2'));
});
test('import previews without writes and rolls back all rows on a conflicting slot', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const rows = [
    { ...bookingBody(f.date), phone: '+77001111111' },
    { ...bookingBody(f.date, '11:00'), phone: '+77002222222' },
  ];
  assert.equal((await importBookings(f.db, f.crypto, rows)).committed, 0);
  assert.equal((await f.db.query('SELECT * FROM bookings')).length, 0);
  assert.equal((await importBookings(f.db, f.crypto, rows, { dryRun: false })).committed, 2);
  await assert.rejects(
    importBookings(
      f.db,
      f.crypto,
      [
        { ...bookingBody(f.date, '12:00'), phone: '+77003333333' },
        { ...bookingBody(f.date), phone: '+77004444444' },
      ],
      { dryRun: false },
    ),
  );
  assert.equal((await f.db.query('SELECT * FROM bookings')).length, 2);
  assert.equal(
    (await f.db.query('SELECT * FROM users WHERE phone_hash=$1', [f.crypto.hash('+77003333333')]))
      .length,
    0,
  );
});
