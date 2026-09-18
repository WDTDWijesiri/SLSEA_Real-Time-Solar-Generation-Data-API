import app, { deploymentFingerprint } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const server = app.listen(config.port, () => {
  console.log(`Real-Time-Solar-Generation-Data-API listening on port ${config.port} (${deploymentFingerprint()})`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing connections`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
