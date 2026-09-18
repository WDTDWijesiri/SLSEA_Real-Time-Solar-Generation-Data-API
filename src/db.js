import mysql from 'mysql2/promise';
import { config } from './config.js';

const connectionOptions = config.databaseUrl ? { uri: config.databaseUrl } : config.mysql;

const nativePool = mysql.createPool({
  ...connectionOptions,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  supportBigNumbers: true,
  multipleStatements: true
});

function resultShape(rows) {
  if (Array.isArray(rows)) return { rows, rowCount: rows.length };
  return { rows: [], rowCount: rows.affectedRows ?? 0, insertId: rows.insertId };
}

export const pool = {
  async connect() {
    const connection = await nativePool.getConnection();
    return {
      async query(text, params) {
        const [rows] = await connection.query(text, params);
        return resultShape(rows);
      },
      release() { connection.release(); }
    };
  },
  end() { return nativePool.end(); }
};

export async function query(text, params) {
  const [rows] = await nativePool.query(text, params);
  return resultShape(rows);
}
