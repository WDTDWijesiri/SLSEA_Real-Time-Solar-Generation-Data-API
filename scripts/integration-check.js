import assert from 'node:assert/strict';

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function call(path, options = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  if (text) body = JSON.parse(text);
  assert.equal(response.status, expected, `${options.method ?? 'GET'} ${path}: ${text}`);
  return { response, body };
}

const json = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body)
});

async function loginUser(email, password = 'NationalDemo!2026') {
  return (await call('/api/v1/auth/user-token', json({ email, password }))).body.accessToken;
}

async function integration() {
  const national = await loginUser('national@slsea.gov.lk');
  const nationalHeaders = { Authorization: `Bearer ${national}`, Accept: 'application/json' };
  const provinces = await call('/api/v1/provinces', { headers: nationalHeaders });
  assert.equal(provinces.body.total, 9);

  const western = provinces.body.data.find((province) => province.code === 'WP');
  const westernDistricts = await call(`/api/v1/provinces/${western.id}/districts`, { headers: nationalHeaders });
  const colombo = westernDistricts.body.data.find((district) => district.code === 'COL');
  const otherDistrict = westernDistricts.body.data.find((district) => district.id !== colombo.id);

  const district = await loginUser('col@slsea.gov.lk');
  const districtHeaders = { Authorization: `Bearer ${district}`, Accept: 'application/json' };
  const scopedProvinces = await call('/api/v1/provinces', { headers: districtHeaders });
  assert.equal(scopedProvinces.body.total, 1);
  await call(`/api/v1/districts/${otherDistrict.id}`, { headers: districtHeaders }, 404);

  const substations = await call(`/api/v1/districts/${colombo.id}/substations`, { headers: nationalHeaders });
  const installations = await call(`/api/v1/substations/${substations.body.data[0].id}/installations`, { headers: nationalHeaders });
  const ownInstallation = installations.body.data.find((item) => item.meter_id === 'SL-MTR-00001');
  assert.ok(ownInstallation);

  const overview = await call(`/api/v1/installations/${ownInstallation.id}/overview`, { headers: nationalHeaders });
  assert.equal(overview.body.data.district.id, colombo.id);
  assert.ok(overview.body.data.reading_count >= 672);

  const latest = await call(`/api/v1/installations/${ownInstallation.id}/latest-reading`, { headers: nationalHeaders });
  const lastModified = latest.response.headers.get('last-modified');
  await call(`/api/v1/installations/${ownInstallation.id}/latest-reading`, { headers: { ...nationalHeaders, 'If-Modified-Since': lastModified } }, 304);

  const deviceLogin = await call('/api/v1/auth/device-token', json({ meterId: 'SL-MTR-00001', secret: 'MeterDemo!2026' }));
  assert.equal(deviceLogin.body.installationId, ownInstallation.id);
  const reading = {
    recordedAt: new Date().toISOString(),
    powerKw: 2.75,
    cumulativeEnergyKwh: Number(latest.body.data.cumulative_energy_kwh) + 0.25,
    voltageV: 230.5
  };
  const created = await call(`/api/v1/installations/${ownInstallation.id}/readings`, json(reading, deviceLogin.body.accessToken), 201);
  const location = created.response.headers.get('location');
  assert.match(location, /^\/api\/v1\/readings\//);
  const retrieved = await call(location, { headers: nationalHeaders });
  assert.equal(retrieved.body.data.id, created.body.data.id);

  const otherInstallation = installations.body.data.find((item) => item.id !== ownInstallation.id);
  await call(`/api/v1/installations/${otherInstallation.id}/readings`, json(reading, deviceLogin.body.accessToken), 403);

  const history = await call(`/api/v1/installations/${ownInstallation.id}/readings?page=1&pageSize=5&sort=-recordedAt`, { headers: nationalHeaders });
  assert.equal(history.body.data.length, 5);
  assert.ok(history.body.pagination.total >= 673);
  assert.ok(history.body.links.next);

  const summary = await call(`/api/v1/districts/${colombo.id}/generation-summary`, { headers: nationalHeaders });
  assert.ok(Number(summary.body.data.installation_count) > 0);
  assert.ok(Number(summary.body.data.current_power_kw) >= 0);
  console.log('Integration checks passed: scope denial, composite/derived resources, conditional GET, device ownership, ingestion, retrieval, history, and district summary');
}

integration().catch((error) => { console.error(error); process.exit(1); });
