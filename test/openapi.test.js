import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import YAML from 'yaml';

const specification = YAML.parse(fs.readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

test('OpenAPI declares required operational, analytical, and processing resources', () => {
  const required = [
    '/installations/{id}/latest-reading',
    '/installations/{installationId}/readings',
    '/installations/{id}/overview',
    '/districts/{id}/generation-summary'
  ];
  for (const path of required) assert.ok(specification.paths[path], `${path} must be documented`);
});

test('reading ingestion documents created semantics and Location', () => {
  const created = specification.paths['/installations/{installationId}/readings'].post.responses['201'];
  assert.ok(created);
  assert.ok(created.headers.Location);
});

test('OpenAPI separates user and device security schemes', () => {
  assert.ok(specification.components.securitySchemes.userBearer);
  assert.ok(specification.components.securitySchemes.deviceBearer);
});

test('persistent resource identifiers are documented as integers', () => {
  assert.equal(specification.components.parameters.Id.schema.type, 'integer');
  assert.equal(specification.components.schemas.Province.properties.id.type, 'integer');
  assert.equal(specification.components.schemas.Reading.properties.id.type, 'integer');
  assert.equal(specification.components.schemas.DeviceToken.properties.installationId.type, 'integer');
});
