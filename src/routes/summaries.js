import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { resourceLink, sendCacheable, withLinks } from '../utils/http.js';
import { scopeClause } from '../utils/scope.js';

const router = Router();

router.get('/districts/:id/generation-summary', authenticateUser, asyncHandler(async (request, response) => {
  const id = z.coerce.number().int().positive().parse(request.params.id);
  const params = [id];
  const scope = scopeClause(request.auth, params);
  const scopeValues = params.slice(1);
  const colomboNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayStart = new Date(Date.UTC(colomboNow.getUTCFullYear(), colomboNow.getUTCMonth(), colomboNow.getUTCDate()) - 5.5 * 60 * 60 * 1000);
  params.push(todayStart, id, ...scopeValues);
  const result = await query(`
    WITH eligible AS (
      SELECT i.id FROM solar_installations i
      JOIN grid_substations s ON s.id = i.substation_id
      JOIN districts d ON d.id = s.district_id
      JOIN provinces p ON p.id = d.province_id
      WHERE d.id = ? AND ${scope}
    ), ranked AS (
      SELECT r.installation_id, r.power_kw, r.recorded_at,
        ROW_NUMBER() OVER (PARTITION BY r.installation_id ORDER BY r.recorded_at DESC) AS rn
      FROM generation_readings r JOIN eligible e ON e.id = r.installation_id
    ), latest AS (
      SELECT installation_id, power_kw, recorded_at FROM ranked WHERE rn = 1
    ), today AS (
      SELECT r.installation_id, max(r.cumulative_energy_kwh) - min(r.cumulative_energy_kwh) AS energy_kwh
      FROM generation_readings r JOIN eligible e ON e.id = r.installation_id
      WHERE r.recorded_at >= ?
      GROUP BY r.installation_id
    )
    SELECT d.id AS district_id, d.name AS district_name,
      (SELECT count(*) FROM eligible) AS installation_count,
      COALESCE((SELECT sum(power_kw) FROM latest), 0) AS current_power_kw,
      COALESCE((SELECT sum(energy_kwh) FROM today), 0) AS today_energy_kwh,
      (SELECT max(recorded_at) FROM latest) AS as_of
    FROM districts d
    JOIN provinces p ON p.id = d.province_id
    WHERE d.id = ? AND ${scope}`, params);
  if (!result.rows[0]) throw notFound('District');
  const summary = withLinks(result.rows[0], {
    self: resourceLink(request, `/api/v1/districts/${id}/generation-summary`),
    district: resourceLink(request, `/api/v1/districts/${id}`),
    substations: resourceLink(request, `/api/v1/districts/${id}/substations`)
  });
  sendCacheable(request, response, { data: summary }, result.rows[0].as_of ?? new Date(0));
}));

export default router;
