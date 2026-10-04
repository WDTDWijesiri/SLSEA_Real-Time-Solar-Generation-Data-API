import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { resourceLink, sendCacheable, withLinks } from '../utils/http.js';
import { scopeClause } from '../utils/scope.js';

const router = Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });

function installationLinks(request, installation) {
  return {
    self: resourceLink(request, `/api/v1/installations/${installation.id}`),
    substation: resourceLink(request, `/api/v1/substations/${installation.substation_id}`),
    overview: resourceLink(request, `/api/v1/installations/${installation.id}/overview`),
    readings: resourceLink(request, `/api/v1/installations/${installation.id}/readings`),
    latestReading: resourceLink(request, `/api/v1/installations/${installation.id}/latest-reading`)
  };
}

function readingLinks(request, reading) {
  return {
    self: resourceLink(request, `/api/v1/readings/${reading.id}`),
    installation: resourceLink(request, `/api/v1/installations/${reading.installation_id}`),
    installationReadings: resourceLink(request, `/api/v1/installations/${reading.installation_id}/readings`)
  };
}

router.get('/installations/:id', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`
    SELECT i.id, i.name, i.meter_id, i.capacity_kw, i.latitude, i.longitude,
      i.commissioned_on, i.status, i.substation_id, s.name AS substation_name,
      d.id AS district_id, d.name AS district_name, p.id AS province_id,
      p.name AS province_name, i.created_at, i.updated_at
    FROM solar_installations i
    JOIN grid_substations s ON s.id = i.substation_id
    JOIN districts d ON d.id = s.district_id
    JOIN provinces p ON p.id = d.province_id
    WHERE i.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('Solar installation');
  sendCacheable(request, response, { data: withLinks(result.rows[0], installationLinks(request, result.rows[0])) }, result.rows[0].updated_at);
}));

router.get('/installations/:id/overview', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`
    SELECT i.id, i.name, i.meter_id, i.capacity_kw, i.latitude, i.longitude,
      i.commissioned_on, i.status, i.updated_at,
      s.id AS related_substation_id, s.name AS related_substation_name, s.code AS related_substation_code,
      d.id AS related_district_id, d.name AS related_district_name, d.code AS related_district_code,
      p.id AS related_province_id, p.name AS related_province_name, p.code AS related_province_code,
      r.id AS latest_reading_id, r.recorded_at AS latest_recorded_at,
      r.power_kw AS latest_power_kw, r.cumulative_energy_kwh AS latest_cumulative_energy_kwh,
      r.voltage_v AS latest_voltage_v,
      COALESCE(stats.reading_count, 0) AS reading_count,
      stats.first_recorded_at, stats.last_recorded_at
    FROM solar_installations i
    JOIN grid_substations s ON s.id = i.substation_id
    JOIN districts d ON d.id = s.district_id
    JOIN provinces p ON p.id = d.province_id
    LEFT JOIN LATERAL (
      SELECT gr.* FROM generation_readings gr WHERE gr.installation_id = i.id ORDER BY gr.recorded_at DESC LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*) AS reading_count, min(recorded_at) AS first_recorded_at, max(recorded_at) AS last_recorded_at
      FROM generation_readings WHERE installation_id = i.id
    ) stats ON TRUE
    WHERE i.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('Solar installation');
  const row = result.rows[0];
  const data = {
    id: row.id, name: row.name, meter_id: row.meter_id, capacity_kw: row.capacity_kw,
    latitude: row.latitude, longitude: row.longitude, commissioned_on: row.commissioned_on,
    status: row.status, updated_at: row.updated_at,
    substation: { id: row.related_substation_id, name: row.related_substation_name, code: row.related_substation_code },
    district: { id: row.related_district_id, name: row.related_district_name, code: row.related_district_code },
    province: { id: row.related_province_id, name: row.related_province_name, code: row.related_province_code },
    latest_reading: row.latest_reading_id ? {
      id: row.latest_reading_id, recordedAt: row.latest_recorded_at, powerKw: row.latest_power_kw,
      cumulativeEnergyKwh: row.latest_cumulative_energy_kwh, voltageV: row.latest_voltage_v
    } : null,
    reading_count: Number(row.reading_count), first_recorded_at: row.first_recorded_at, last_recorded_at: row.last_recorded_at
  };
  data._links = installationLinks(request, { id: row.id, substation_id: row.related_substation_id });
  const modified = row.last_recorded_at ?? row.updated_at;
  sendCacheable(request, response, { data }, modified);
}));

router.get('/installations/:id/latest-reading', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`
    SELECT r.id, r.installation_id, r.recorded_at, r.power_kw, r.cumulative_energy_kwh, r.voltage_v, r.created_at
    FROM solar_installations i
    JOIN grid_substations s ON s.id = i.substation_id
    JOIN districts d ON d.id = s.district_id
    JOIN provinces p ON p.id = d.province_id
    JOIN LATERAL (SELECT gr.* FROM generation_readings gr WHERE gr.installation_id = i.id ORDER BY gr.recorded_at DESC LIMIT 1) r ON TRUE
    WHERE i.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('Latest generation reading');
  sendCacheable(request, response, { data: withLinks(result.rows[0], readingLinks(request, result.rows[0])) }, result.rows[0].created_at);
}));

export default router;
