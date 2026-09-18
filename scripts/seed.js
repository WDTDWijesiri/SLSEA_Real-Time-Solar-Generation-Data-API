import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const geography = [
  ['Western', 'WP', ['Colombo', 'Gampaha', 'Kalutara']],
  ['Central', 'CP', ['Kandy', 'Matale', 'Nuwara Eliya']],
  ['Southern', 'SP', ['Galle', 'Matara', 'Hambantota']],
  ['Northern', 'NP', ['Jaffna', 'Kilinochchi', 'Mannar', 'Mullaitivu', 'Vavuniya']],
  ['Eastern', 'EP', ['Trincomalee', 'Batticaloa', 'Ampara']],
  ['North Western', 'NWP', ['Kurunegala', 'Puttalam']],
  ['North Central', 'NCP', ['Anuradhapura', 'Polonnaruwa']],
  ['Uva', 'UP', ['Badulla', 'Monaragala']],
  ['Sabaragamuwa', 'SGP', ['Ratnapura', 'Kegalle']]
];

const districtCodes = {
  Colombo: 'COL', Gampaha: 'GAM', Kalutara: 'KAL', Kandy: 'KAN', Matale: 'MTL',
  'Nuwara Eliya': 'NUE', Galle: 'GAL', Matara: 'MTR', Hambantota: 'HAM', Jaffna: 'JAF',
  Kilinochchi: 'KIL', Mannar: 'MAN', Mullaitivu: 'MUL', Vavuniya: 'VAV', Trincomalee: 'TRI',
  Batticaloa: 'BAT', Ampara: 'AMP', Kurunegala: 'KUR', Puttalam: 'PUT', Anuradhapura: 'ANU',
  Polonnaruwa: 'POL', Badulla: 'BAD', Monaragala: 'MON', Ratnapura: 'RAT', Kegalle: 'KEG'
};

async function upsertAndGet(client, table, uniqueColumn, uniqueValue, insertSql, values) {
  await client.query(insertSql, values);
  return (await client.query(`SELECT * FROM ${table} WHERE ${uniqueColumn} = ?`, [uniqueValue])).rows[0];
}

function seededVariation(key, maximum) {
  const value = crypto.createHash('sha256').update(key).digest().readUInt32BE(0);
  return value % maximum;
}

async function seedReadings(client, installations, days, intervalMinutes) {
  const end = new Date(Math.floor(Date.now() / (intervalMinutes * 60_000)) * intervalMinutes * 60_000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60_000);
  const rows = [];
  const batchSize = 1_000;
  let inserted = 0;

  for (const installation of installations) {
    let cumulative = 1_000 + seededVariation(installation.meter_id, 2_000);
    for (let time = start.getTime(); time <= end.getTime(); time += intervalMinutes * 60_000) {
      const recordedAt = new Date(time);
      const colombo = new Date(time + 5.5 * 60 * 60_000);
      const hour = colombo.getUTCHours() + colombo.getUTCMinutes() / 60;
      const daylight = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
      const variation = 0.82 + seededVariation(`${installation.meter_id}:${time}`, 15) / 100;
      const powerKw = Number((daylight * Number(installation.capacity_kw) * variation).toFixed(3));
      cumulative += powerKw * intervalMinutes / 60;
      const voltage = Number((228 + seededVariation(`v:${installation.meter_id}:${time}`, 500) / 100).toFixed(2));
      rows.push([installation.id, recordedAt, powerKw, Number(cumulative.toFixed(3)), voltage]);

      if (rows.length === batchSize) {
        const result = await client.query('INSERT IGNORE INTO generation_readings (installation_id, recorded_at, power_kw, cumulative_energy_kwh, voltage_v) VALUES ?', [rows]);
        inserted += result.rowCount;
        rows.length = 0;
      }
    }
  }
  if (rows.length) {
    const result = await client.query('INSERT IGNORE INTO generation_readings (installation_id, recorded_at, power_kw, cumulative_energy_kwh, voltage_v) VALUES ?', [rows]);
    inserted += result.rowCount;
  }
  return inserted;
}

async function seed() {
  const client = await pool.connect();
  const passwordHash = await bcrypt.hash('NationalDemo!2026', 12);
  const deviceHash = await bcrypt.hash('MeterDemo!2026', 12);
  const intervalMinutes = Number(process.env.SEED_INTERVAL_MINUTES ?? 15);
  const days = Number(process.env.SEED_DAYS ?? 7);
  try {
    await client.query('START TRANSACTION');
    const districts = [];
    for (const [provinceName, provinceCode, districtNames] of geography) {
      const province = await upsertAndGet(client, 'provinces', 'code', provinceCode,
        'INSERT INTO provinces (name, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
        [provinceName, provinceCode]);
      for (const districtName of districtNames) {
        const district = await upsertAndGet(client, 'districts', 'code', districtCodes[districtName],
          'INSERT INTO districts (province_id, name, code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), province_id = VALUES(province_id)',
          [province.id, districtName, districtCodes[districtName]]);
        districts.push(district);
      }
      await client.query(`INSERT INTO users (email, name, password_hash, role, province_id) VALUES (?, ?, ?, 'province', ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), province_id = VALUES(province_id)`,
      [`${provinceCode.toLowerCase()}@slsea.gov.lk`, `${provinceName} Operator`, passwordHash, province.id]);
    }
    await client.query(`INSERT INTO users (email, name, password_hash, role) VALUES ('national@slsea.gov.lk', 'National Operator', ?, 'national')
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`, [passwordHash]);

    const substations = [];
    for (let index = 0; index < districts.length; index += 1) {
      const district = districts[index];
      const substationCode = `GS-${String(index + 1).padStart(3, '0')}`;
      const substation = await upsertAndGet(client, 'grid_substations', 'code', substationCode,
        `INSERT INTO grid_substations (district_id, name, code, capacity_mva, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE district_id = VALUES(district_id), name = VALUES(name)`,
        [district.id, `${district.name} Grid Substation`, substationCode, 20 + index % 8 * 5, 5.95 + (index % 10) * 0.22, 79.86 + (index % 7) * 0.23]);
      substations.push(substation);
      await client.query(`INSERT INTO users (email, name, password_hash, role, district_id) VALUES (?, ?, ?, 'district', ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), district_id = VALUES(district_id)`,
      [`${districtCodes[district.name].toLowerCase()}@slsea.gov.lk`, `${district.name} Operator`, passwordHash, district.id]);
    }

    for (let index = 0; index < 200; index += 1) {
      const meterId = `SL-MTR-${String(index + 1).padStart(5, '0')}`;
      await client.query(`INSERT INTO solar_installations
        (substation_id, name, meter_id, capacity_kw, latitude, longitude, commissioned_on, device_secret_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE substation_id = VALUES(substation_id), name = VALUES(name), device_secret_hash = VALUES(device_secret_hash)`,
      [substations[index % substations.length].id, `Rooftop Solar ${String(index + 1).padStart(3, '0')}`, meterId,
        3 + index % 8 * 0.75, 5.95 + (index % 50) * 0.12, 79.86 + (index % 30) * 0.1,
        `202${index % 5}-0${index % 9 + 1}-15`, deviceHash]);
    }
    await client.query('COMMIT');
    console.log('Seeded 9 provinces, 25 districts, 25 substations, 200 installations, and scoped users');

    const installations = (await client.query('SELECT id, meter_id, capacity_kw FROM solar_installations ORDER BY meter_id')).rows;
    await seedReadings(client, installations, days, intervalMinutes);
    const count = await client.query('SELECT count(*) AS count FROM generation_readings');
    console.log(`Seeded ${count.rows[0].count} generation readings with a realistic diurnal curve`);
    console.log('Demo user: national@slsea.gov.lk / NationalDemo!2026');
    console.log('Demo device: SL-MTR-00001 / MeterDemo!2026');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may already be committed */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => { console.error(error); process.exit(1); });
