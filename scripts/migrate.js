import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(directory, '../migrations');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(255) PRIMARY KEY, applied_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
    const files = (await fs.readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name = ?', [file]);
      if (exists.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await fs.readFile(path.join(migrationsDirectory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        await client.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => { console.error(error); process.exit(1); });
