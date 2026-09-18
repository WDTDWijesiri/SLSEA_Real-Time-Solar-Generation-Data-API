import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageLinks, sendCacheable } from '../src/utils/http.js';

test('pagination links retain filters and expose adjacent pages', () => {
  const request = { protocol: 'https', get: () => 'api.example.test', originalUrl: '/api/v1/readings?districtId=abc&page=2&pageSize=25' };
  const links = buildPageLinks(request, 2, 25, 80);
  assert.match(links.next, /page=3/);
  assert.match(links.previous, /page=1/);
  assert.match(links.self, /districtId=abc/);
});

test('cache validator returns 304 with an empty body for a matching ETag', () => {
  const headers = new Map();
  let status;
  let ended = false;
  const response = {
    set(name, value) { headers.set(name, value); return this; },
    status(value) { status = value; return this; },
    end() { ended = true; return this; },
    json() { throw new Error('body must not be sent'); }
  };
  const initialRequest = { get: () => undefined };
  const body = { data: { id: 'one' } };
  const firstResponse = { set(name, value) { headers.set(name, value); return this; }, json(value) { return value; } };
  sendCacheable(initialRequest, firstResponse, body, '2026-09-17T00:00:00Z');
  const request = { get: (name) => name === 'If-None-Match' ? headers.get('ETag') : undefined };
  sendCacheable(request, response, body, '2026-09-17T00:00:00Z');
  assert.equal(status, 304);
  assert.equal(ended, true);
});

test('a stale If-Match validator fails with 412 semantics', () => {
  const request = { get: (name) => name === 'If-Match' ? '"stale"' : undefined };
  const response = { set() { return this; } };
  assert.throws(
    () => sendCacheable(request, response, { data: { id: 'current' } }, '2026-09-17T00:00:00Z'),
    (error) => error.status === 412 && error.code === 'PRECONDITION_FAILED'
  );
});
