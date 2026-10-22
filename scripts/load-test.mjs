import { performance } from 'node:perf_hooks';
const base = process.env.LOAD_TEST_URL || 'http://127.0.0.1:3001';
const concurrency = Number(process.env.LOAD_USERS || 200);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 600)
  throw new Error('LOAD_USERS must be 1–600');
const health = await fetch(`${base}/api/health`);
if (!health.ok) throw new Error('Server unavailable');
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Almaty',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
// Workload: every simulated visitor loads the catalogue and then queries real DB-backed slots.
const latencies = [];
let failures = 0;
const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (const route of ['/api/catalog', `/api/slots?doctorId=aida&date=${today}`]) {
      const start = performance.now();
      try {
        const response = await fetch(`${base}${route}`);
        await response.arrayBuffer();
        if (!response.ok) failures++;
      } catch {
        failures++;
      }
      latencies.push(performance.now() - start);
    }
  }),
);
latencies.sort((a, b) => a - b);
const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
console.log(
  JSON.stringify(
    {
      concurrentVisitors: concurrency,
      requests: latencies.length,
      failures,
      p95Ms: Number(p95.toFixed(2)),
      totalMs: Math.round(performance.now() - started),
      targetMs: 800,
      passed: failures === 0 && p95 < 800,
    },
    null,
    2,
  ),
);
if (failures || p95 >= 800) process.exitCode = 1;
