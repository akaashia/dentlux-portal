import { readFileSync } from 'node:fs';
import { loadConfig } from '../backend/config.mjs';
import { openDatabase } from '../backend/db.mjs';
import { createCrypto } from '../backend/crypto.mjs';
import { parseCsv, importBookings } from '../backend/import.mjs';
const fileIndex = process.argv.indexOf('--file');
const filename = process.argv[fileIndex + 1];
if (fileIndex < 0 || !filename) {
  console.error('Usage: npm run db:import -- --file bookings.csv [--commit]');
  process.exit(1);
}
const config = loadConfig(),
  db = await openDatabase(config);
try {
  const contents = readFileSync(filename, 'utf8');
  const rows = filename.endsWith('.json') ? JSON.parse(contents) : parseCsv(contents);
  console.log(
    JSON.stringify(
      await importBookings(db, createCrypto(config), rows, {
        dryRun: !process.argv.includes('--commit'),
      }),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    'Import rolled back:',
    error.code || (error.name === 'Error' ? error.message : error.name),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
