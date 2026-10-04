import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { authenticateDevice, authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { buildHypermediaPageLinks, buildPageLinks, resourceLink, sendCacheable, withLinks } from '../utils/http.js';
import { scopeClause } from '../utils/scope.js';
import { ensureVisible } from '../services/access.js';

const router = Router();
const resourceId = z.coerce.number().int().positive();
const readingBody = z.object({
  recordedAt: z.iso.datetime({ offset: true }),
  powerKw: z.number().nonnegative().max(100_000),
  cumulativeEnergyKwh: z.number().nonnegative().max(1_000_000_000),
  voltageV: z.number().positive().max(1_000)
}).strict();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['recordedAt', '-recordedAt']).default('-recordedAt'),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  provinceId: resourceId.optional(),
  districtId: resourceId.optional(),
  substationId: resourceId.optional()
}).strict();

function readingResource(request, reading) {
  return withLinks(reading, {
    self: resourceLink(request, `/api/v1/readings/${reading.id}`),
    installation: resourceLink(request, `/api/v1/installations/${reading.installation_id}`),
    installationReadings: resourceLink(request, `/api/v1/installations/${reading.installation_id}/readings`)
  });
}

router.post('/installations/:installationId/readings', authenticateDevice, asyncHandler(async (request, response) => {
  const installationId = resourceId.parse(request.params.installationId);
  const body = readingBody.parse(request.body);
  const recordedAt = new Date(body.recordedAt);
  if (recordedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new ApiError(400, 'FUTURE_READING', 'recordedAt cannot be more than five minutes in the future', [{ field: 'recordedAt', issue: 'Future timestamp' }]);
  }
  const latest = await query('SELECT cumulative_energy_kwh FROM generation_readings WHERE installation_id = ? AND recorded_at < ? ORDER BY recorded_at DESC LIMIT 1', [installationId, recordedAt]);
  if (latest.rows[0] && Number(body.cumulativeEnergyKwh) < Number(latest.rows[0].cumulative_energy_kwh)) {
    throw new ApiError(400, 'ENERGY_REGRESSION', 'Cumulative energy cannot be lower than the preceding reading', [{ field: 'cumulativeEnergyKwh', issue: 'Must not decrease' }]);
  }
  const insertion = await query(`INSERT INTO generation_readings (installation_id, recorded_at, power_kw, cumulative_energy_kwh, voltage_v)
    VALUES (?, ?, ?, ?, ?)`,
  [installationId, recordedAt, body.powerKw, body.cumulativeEnergyKwh, body.voltageV]);
  const readingId = insertion.insertId;
  const result = await query('SELECT id, installation_id, recorded_at, power_kw, cumulative_energy_kwh, voltage_v, created_at FROM generation_readings WHERE id = ?', [readingId]);
  const resource = result.rows[0];
  response.location(`${request.baseUrl}/readings/${resource.id}`).status(201).json({ data: readingResource(request, resource) });
}));

router.get('/installations/:installationId/readings', authenticateUser, asyncHandler(async (request, response) => {
  const installationId = resourceId.parse(request.params.installationId);
  await ensureVisible('installation', installationId, request.auth);
  const filters = listQuery.omit({ provinceId: true, districtId: true, substationId: true }).parse(request.query);
  await listReadings(request, response, { ...filters, installationId });
}));

router.get('/readings', authenticateUser, asyncHandler(async (request, response) => {
  const filters = listQuery.parse(request.query);
  await listReadings(request, response, filters);
}));

router.get('/readings/:id', authenticateUser, asyncHandler(async (request, response) => {
  const id = resourceId.parse(request.params.id);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`
    SELECT r.id, r.installation_id, r.recorded_at, r.power_kw, r.cumulative_energy_kwh, r.voltage_v, r.created_at
    FROM generation_readings r
    JOIN solar_installations i ON i.id = r.installation_id
    JOIN grid_substations s ON s.id = i.substation_id
    JOIN districts d ON d.id = s.district_id
    JOIN provinces p ON p.id = d.province_id
    WHERE r.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('Generation reading');
  sendCacheable(request, response, { data: readingResource(request, result.rows[0]) }, result.rows[0].created_at);
}));

async function listReadings(request, response, filters) {
  if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) {
    throw new ApiError(400, 'INVALID_TIME_WINDOW', 'from must be earlier than or equal to to');
  }
  const params = [];
  const conditions = [scopeClause(request.auth, params)];
  const add = (value, expression) => { if (value) { params.push(value); conditions.push(expression); } };
  add(filters.installationId, 'i.id = ?');
  add(filters.provinceId, 'p.id = ?');
  add(filters.districtId, 'd.id = ?');
  add(filters.substationId, 's.id = ?');
  add(filters.from ? new Date(filters.from) : undefined, 'r.recorded_at >= ?');
  add(filters.to ? new Date(filters.to) : undefined, 'r.recorded_at <= ?');
  const where = conditions.join(' AND ');
  const countResult = await query(`SELECT count(*) AS total FROM generation_readings r JOIN solar_installations i ON i.id = r.installation_id JOIN grid_substations s ON s.id = i.substation_id JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id WHERE ${where}`, params);
  const total = Number(countResult.rows[0].total);
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const direction = filters.sort.startsWith('-') ? 'DESC' : 'ASC';
  const result = await query(`
    SELECT r.id, r.installation_id, r.recorded_at, r.power_kw, r.cumulative_energy_kwh, r.voltage_v, r.created_at
    FROM generation_readings r
    JOIN solar_installations i ON i.id = r.installation_id
    JOIN grid_substations s ON s.id = i.substation_id
    JOIN districts d ON d.id = s.district_id
    JOIN provinces p ON p.id = d.province_id
    WHERE ${where}
    ORDER BY r.recorded_at ${direction}, r.id ${direction}
    LIMIT ? OFFSET ?`, params);
  const body = {
    data: result.rows.map((row) => readingResource(request, row)),
    pagination: { page: filters.page, pageSize: filters.pageSize, total, pageCount: Math.ceil(total / filters.pageSize) },
    links: buildPageLinks(request, filters.page, filters.pageSize, total),
    _links: buildHypermediaPageLinks(request, filters.page, filters.pageSize, total)
  };
  const modified = result.rows.reduce((latest, row) => row.created_at > latest ? row.created_at : latest, new Date(0));
  sendCacheable(request, response, body, modified);
}

export default router;
