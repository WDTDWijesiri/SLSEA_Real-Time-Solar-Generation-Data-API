const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const email = process.env.SMOKE_USER_EMAIL ?? 'national@slsea.gov.lk';
const password = process.env.SMOKE_USER_PASSWORD ?? 'NationalDemo!2026';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status} ${path}: ${text}`);
  return { response, body };
}

async function smoke() {
  await request('/health');
  const login = await request('/api/v1/auth/user-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const headers = { Authorization: `Bearer ${login.body.accessToken}`, Accept: 'application/json' };
  const provinces = await request('/api/v1/provinces', { headers });
  if (provinces.body.total !== 9) throw new Error(`Expected 9 provinces, received ${provinces.body.total}`);
  const history = await request('/api/v1/readings?page=1&pageSize=10&sort=-recordedAt', { headers });
  if (history.body.pagination.total < 134_000) throw new Error(`Expected substantial reading history, received ${history.body.pagination.total}`);
  const etag = history.response.headers.get('etag');
  const cached = await fetch(`${baseUrl}/api/v1/readings?page=1&pageSize=10&sort=-recordedAt`, { headers: { ...headers, 'If-None-Match': etag } });
  if (cached.status !== 304 || (await cached.text()) !== '') throw new Error('Conditional GET did not return an empty 304');
  console.log(`Smoke checks passed against ${baseUrl}`);
}

smoke().catch((error) => { console.error(error); process.exit(1); });
