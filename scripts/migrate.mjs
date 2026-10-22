import { loadConfig } from '../backend/config.mjs';
import { openDatabase } from '../backend/db.mjs';
const db = await openDatabase(loadConfig());
console.log('Schema is up to date.');
await db.close();
