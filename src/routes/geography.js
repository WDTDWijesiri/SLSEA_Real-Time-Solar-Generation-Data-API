import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { buildHypermediaPageLinks, buildPageLinks, resourceLink, sendCacheable, withLinks } from '../utils/http.js';
import { scopeClause } from '../utils/scope.js';
import { ensureVisible } from '../services/access.js';

const router = Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });
const collectionQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
}).strict();

function paginatedBody(request, filters, total, rows) {
  return {
    data: rows,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize)
    },
    links: buildPageLinks(request, filters.page, filters.pageSize, total),
    _links: buildHypermediaPageLinks(request, filters.page, filters.pageSize, total)
  };
}

const provinceResource = (request, province) => withLinks(province, {
  self: resourceLink(request, `/api/v1/provinces/${province.id}`),
  districts: resourceLink(request, `/api/v1/provinces/${province.id}/districts`)
});

const districtResource = (request, district) => withLinks(district, {
  self: resourceLink(request, `/api/v1/districts/${district.id}`),
  province: resourceLink(request, `/api/v1/provinces/${district.province_id}`),
  substations: resourceLink(request, `/api/v1/districts/${district.id}/substations`),
  generationSummary: resourceLink(request, `/api/v1/districts/${district.id}/generation-summary`)
});

const substationResource = (request, substation) => withLinks(substation, {
  self: resourceLink(request, `/api/v1/substations/${substation.id}`),
  district: resourceLink(request, `/api/v1/districts/${substation.district_id}`),
  installations: resourceLink(request, `/api/v1/substations/${substation.id}/installations`)
});

const installationResource = (request, installation) => withLinks(installation, {
  self: resourceLink(request, `/api/v1/installations/${installation.id}`),
  substation: resourceLink(request, `/api/v1/substations/${installation.substation_id}`),
  overview: resourceLink(request, `/api/v1/installations/${installation.id}/overview`),
  readings: resourceLink(request, `/api/v1/installations/${installation.id}/readings`),
  latestReading: resourceLink(request, `/api/v1/installations/${installation.id}/latest-reading`)
});

router.get('/provinces', authenticateUser, asyncHandler(async (request, response) => {
  const filters = collectionQuery.parse(request.query);
  const params = [];
  let where = 'TRUE';
  if (request.auth.role === 'province') { params.push(request.auth.provinceId); where = 'p.id = ?'; }
  if (request.auth.role === 'district') { params.push(request.auth.districtId); where = 'EXISTS (SELECT 1 FROM districts d WHERE d.province_id = p.id AND d.id = ?)'; }
  const countResult = await query(`SELECT count(*) AS total FROM provinces p WHERE ${where}`, params);
  const total = Number(countResult.rows[0].total);
  const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const result = await query(`SELECT p.id, p.name, p.code, p.updated_at FROM provinces p WHERE ${where} ORDER BY p.name, p.id LIMIT ? OFFSET ?`, pageParams);
  const resources = result.rows.map((row) => provinceResource(request, row));
  sendCacheable(request, response, paginatedBody(request, filters, total, resources), result.rows.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, new Date(0)));
}));

router.get('/provinces/:id', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  let allowed = 'TRUE';
  if (request.auth.role === 'province') { params.push(request.auth.provinceId); allowed = 'p.id = ?'; }
  if (request.auth.role === 'district') { params.push(request.auth.districtId); allowed = 'EXISTS (SELECT 1 FROM districts sd WHERE sd.province_id = p.id AND sd.id = ?)'; }
  const result = await query(`SELECT p.id, p.name, p.code, p.created_at, p.updated_at FROM provinces p WHERE p.id = ? AND ${allowed}`, params);
  if (!result.rows[0]) throw notFound('Province');
  sendCacheable(request, response, { data: provinceResource(request, result.rows[0]) }, result.rows[0].updated_at);
}));

router.get('/provinces/:id/districts', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const filters = collectionQuery.parse(request.query);
  await ensureVisible('province', id, request.auth);
  const params = [id];
  let allowed = 'TRUE';
  if (request.auth.role === 'province') { params.push(request.auth.provinceId); allowed = 'd.province_id = ?'; }
  if (request.auth.role === 'district') { params.push(request.auth.districtId); allowed = 'd.id = ?'; }
  const countResult = await query(`SELECT count(*) AS total FROM districts d WHERE d.province_id = ? AND ${allowed}`, params);
  const total = Number(countResult.rows[0].total);
  const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const result = await query(`SELECT d.id, d.province_id, d.name, d.code, d.updated_at FROM districts d WHERE d.province_id = ? AND ${allowed} ORDER BY d.name, d.id LIMIT ? OFFSET ?`, pageParams);
  const resources = result.rows.map((row) => districtResource(request, row));
  sendCacheable(request, response, paginatedBody(request, filters, total, resources), result.rows.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, new Date(0)));
}));

router.get('/districts/:id', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`SELECT d.id, d.name, d.code, d.province_id, p.name AS province_name, d.created_at, d.updated_at FROM districts d JOIN provinces p ON p.id = d.province_id WHERE d.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('District');
  sendCacheable(request, response, { data: districtResource(request, result.rows[0]) }, result.rows[0].updated_at);
}));

router.get('/districts/:id/substations', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const filters = collectionQuery.parse(request.query);
  await ensureVisible('district', id, request.auth);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const from = 'FROM grid_substations s JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id';
  const where = `WHERE s.district_id = ? AND ${scope}`;
  const countResult = await query(`SELECT count(*) AS total ${from} ${where}`, params);
  const total = Number(countResult.rows[0].total);
  const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const result = await query(`SELECT s.id, s.district_id, s.name, s.code, s.capacity_mva, s.latitude, s.longitude, s.updated_at ${from} ${where} ORDER BY s.name, s.id LIMIT ? OFFSET ?`, pageParams);
  const resources = result.rows.map((row) => substationResource(request, row));
  sendCacheable(request, response, paginatedBody(request, filters, total, resources), result.rows.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, new Date(0)));
}));

router.get('/substations/:id', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const result = await query(`SELECT s.id, s.name, s.code, s.capacity_mva, s.latitude, s.longitude, s.district_id, d.name AS district_name, d.province_id, p.name AS province_name, s.created_at, s.updated_at FROM grid_substations s JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id WHERE s.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('Grid substation');
  sendCacheable(request, response, { data: substationResource(request, result.rows[0]) }, result.rows[0].updated_at);
}));

router.get('/substations/:id/installations', authenticateUser, asyncHandler(async (request, response) => {
  const { id } = idParams.parse(request.params);
  const filters = collectionQuery.parse(request.query);
  await ensureVisible('substation', id, request.auth);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const from = 'FROM solar_installations i JOIN grid_substations s ON s.id = i.substation_id JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id';
  const where = `WHERE i.substation_id = ? AND ${scope}`;
  const countResult = await query(`SELECT count(*) AS total ${from} ${where}`, params);
  const total = Number(countResult.rows[0].total);
  const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const result = await query(`SELECT i.id, i.substation_id, i.name, i.meter_id, i.capacity_kw, i.latitude, i.longitude, i.commissioned_on, i.status, i.updated_at ${from} ${where} ORDER BY i.name, i.id LIMIT ? OFFSET ?`, pageParams);
  const resources = result.rows.map((row) => installationResource(request, row));
  sendCacheable(request, response, paginatedBody(request, filters, total, resources), result.rows.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, new Date(0)));
}));

export default router;
