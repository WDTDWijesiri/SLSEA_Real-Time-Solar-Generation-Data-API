import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import deploymentApp from '../app.js';
import serverlessApp from '../api/index.js';
import app, { createApp } from '../src/app.js';

const isolatedApp = createApp();

test('unknown endpoints return the consistent error contract', async () => {
  const response = await request(isolatedApp).get('/does-not-exist').set('Accept', 'application/json');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
  assert.equal(typeof response.body.error.message, 'string');
  assert.ok(Array.isArray(response.body.error.details));
  assert.equal(typeof response.body.error.requestId, 'string');
});

test('unsupported request media types return 415', async () => {
  const response = await request(isolatedApp).post('/api/v1/auth/user-token').set('Content-Type', 'text/plain').send('not-json');
  assert.equal(response.status, 415);
  assert.equal(response.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
});

test('unacceptable response representations return 406', async () => {
  const response = await request(isolatedApp).get('/api/v1/provinces').set('Accept', 'application/xml');
  assert.equal(response.status, 406);
  assert.equal(response.body.error.code, 'NOT_ACCEPTABLE');
});

test('invalid login input is rejected before database access', async () => {
  const response = await request(isolatedApp).post('/api/v1/auth/user-token').send({ email: 'not-an-email', password: 'short' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.ok(response.body.error.details.length >= 1);
});

test('OpenAPI surface is served by the application', async () => {
  const response = await request(isolatedApp).get('/openapi.yaml').set('Accept', '*/*');
  assert.equal(response.status, 200);
  assert.match(response.text, /openapi: 3\.1\.0/);
});

test('default export is the deployable Express application', async () => {
  assert.equal(deploymentApp, app);
  assert.equal(serverlessApp, app);
  const response = await request(deploymentApp).get('/openapi.yaml').set('Accept', '*/*');
  assert.equal(response.status, 200);
});

test('Swagger UI static assets are served with executable content types', async () => {
  const css = await request(deploymentApp).get('/docs/swagger-ui.css');
  const javascript = await request(deploymentApp).get('/docs/swagger-ui-bundle.js');

  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /^text\/css/);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers['content-type'], /javascript/);
});
