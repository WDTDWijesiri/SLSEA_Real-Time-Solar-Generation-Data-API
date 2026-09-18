import { query } from '../db.js';
import { notFound } from '../errors.js';
import { scopeClause } from '../utils/scope.js';

const resources = {
  province: { label: 'Province', from: 'provinces p LEFT JOIN districts d ON d.province_id = p.id', id: 'p.id' },
  district: { label: 'District', from: 'districts d JOIN provinces p ON p.id = d.province_id', id: 'd.id' },
  substation: { label: 'Grid substation', from: 'grid_substations s JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id', id: 's.id' },
  installation: { label: 'Solar installation', from: 'solar_installations i JOIN grid_substations s ON s.id = i.substation_id JOIN districts d ON d.id = s.district_id JOIN provinces p ON p.id = d.province_id', id: 'i.id' }
};

export async function ensureVisible(type, id, auth) {
  const resource = resources[type];
  const params = [id];
  const scope = scopeClause(auth, params);
  const result = await query(`SELECT 1 FROM ${resource.from} WHERE ${resource.id} = ? AND ${scope} LIMIT 1`, params);
  if (!result.rowCount) throw notFound(resource.label);
}
