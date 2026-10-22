import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { loadConfig } from './config.mjs';
import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';
import { startWorkers } from './notifications.mjs';

const config = loadConfig();
const db = await openDatabase(config);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const { app, crypto, registry, origins } = createApp(db, config, () => {
  for (const socket of sockets.clients)
    if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"availability.changed"}');
});
const server = createServer(app);
server.on('upgrade', (request, socket, head) => {
  if (
    request.url !== '/ws' ||
    !origins.has(request.headers.origin) ||
    sockets.clients.size >= 1000
  ) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) => {
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });
    ws.on('error', () => {});
  });
});
const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.alive) {
      socket.terminate();
      continue;
    }
    socket.alive = false;
    socket.ping();
  }
}, 30000);
heartbeat.unref();
const stopWorkers = startWorkers(db, config, crypto);
server.listen(config.port, config.host, () =>
  console.log(
    `DentLux API: http://${config.host}:${config.port} (${config.demo ? 'DEMO · synthetic data only' : 'live'})`,
  ),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  for (const socket of sockets.clients) socket.terminate();
  sockets.close();
  await stopWorkers();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  registry.clear();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
