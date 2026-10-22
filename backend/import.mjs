import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bookingSchema, phoneSchema, createBookingInTransaction, audit } from './booking.mjs';

// RFC 4180 fields, including quoted commas/newlines and doubled quotation marks.
export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error('Invalid CSV quoting');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error('Unexpected text after closing quote');
      field += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || closed || row.length) {
    row.push(field);
    if (row.some(Boolean)) rows.push(row);
  }
  const [headers, ...values] = rows;
  if (!headers || new Set(headers).size !== headers.length)
    throw new Error('CSV headers are missing or duplicated');
  return values.map((fields, index) => {
    if (fields.length !== headers.length) throw new Error(`Invalid CSV row ${index + 2}`);
    return Object.fromEntries(headers.map((key, i) => [key, fields[i]]));
  });
}
const importSchema = bookingSchema.extend({ phone: phoneSchema, consent: z.literal(true) });
export function validateImport(rows) {
  if (!Array.isArray(rows) || rows.length > 10000 || rows.length === 0)
    throw new Error('Import requires 1–10000 rows');
  return rows.map((row, index) => {
    const data = { ...row, consent: row.consent === true || row.consent === 'true', notify: false };
    const parsed = importSchema.safeParse(data);
    // Only row numbers and field names, never raw personal data in diagnostics.
    if (!parsed.success)
      throw new Error(
        `Row ${index + 1}: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
    return parsed.data;
  });
}
export async function importBookings(db, crypto, rows, { dryRun = true } = {}) {
  const validated = validateImport(rows);
  let imported = 0;
  const rollback = new Error('IMPORT_DRY_RUN_ROLLBACK');
  try {
    await db.transaction(async (tx) => {
      // Stable doctor ordering avoids lock inversions between concurrent bulk imports.
      for (const row of [...validated].sort((a, b) => a.doctorId.localeCompare(b.doctorId))) {
        await tx.query(
          `INSERT INTO users(id,phone_hash,phone_enc,name_enc,role,created_at) VALUES($1,$2,$3,$4,'patient',$5)
          ON CONFLICT(phone_hash) DO NOTHING`,
          [
            randomUUID(),
            crypto.hash(row.phone),
            crypto.encrypt(row.phone),
            crypto.encrypt(row.name),
            new Date().toISOString(),
          ],
        );
        const [user] = await tx.query('SELECT * FROM users WHERE phone_hash=$1', [
          crypto.hash(row.phone),
        ]);
        if (user.role !== 'patient') throw new Error('Cannot import a booking for a staff phone');
        await createBookingInTransaction(tx, crypto, user, row);
        imported++;
      }
      await audit(tx, 'system', 'import.completed', randomUUID(), { count: imported });
      if (dryRun) throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  return { dryRun, input: validated.length, validated: imported, committed: dryRun ? 0 : imported };
}
