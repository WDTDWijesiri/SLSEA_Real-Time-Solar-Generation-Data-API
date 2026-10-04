import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import YAML from 'yaml';

const specification = YAML.parse(fs.readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

test('OpenAPI displays the complete versioned API path for copying', () => {
  assert.equal(specification.servers[0].url, '/');
  for (const path of Object.keys(specification.paths)) {
    assert.match(path, /^\/api\/v1\//);
  }
});

test('OpenAPI declares required operational, analytical, and processing resources', () => {
  const required = [
    '/api/v1/installations/{id}/latest-reading',
    '/api/v1/installations/{installationId}/readings',
    '/api/v1/installations/{id}/overview',
    '/api/v1/districts/{id}/generation-summary'
  ];
  for (const path of required) assert.ok(specification.paths[path], `${path} must be documented`);
});

test('reading ingestion documents created semantics and Location', () => {
  const created = specification.paths['/api/v1/installations/{installationId}/readings'].post.responses['201'];
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

test('all collection resources document the shared pagination contract', () => {
  const collections = [
    '/api/v1/provinces',
    '/api/v1/provinces/{id}/districts',
    '/api/v1/districts/{id}/substations',
    '/api/v1/substations/{id}/installations',
    '/api/v1/installations/{installationId}/readings',
    '/api/v1/readings'
  ];
  for (const path of collections) {
    const parameters = specification.paths[path].get.parameters;
    assert.ok(parameters.some((parameter) => parameter.$ref === '#/components/parameters/Page'), `${path} must document page`);
    assert.ok(parameters.some((parameter) => parameter.$ref === '#/components/parameters/PageSize'), `${path} must document pageSize`);
  }

  for (const schemaName of ['ProvinceCollection', 'DistrictCollection', 'SubstationCollection', 'InstallationCollection']) {
    const properties = specification.components.schemas[schemaName].properties;
    assert.ok(properties.pagination, `${schemaName} must contain pagination metadata`);
    assert.ok(properties.links, `${schemaName} must contain navigation links`);
  }
});

test('OpenAPI documents Level 3 hypermedia controls', () => {
  assert.ok(specification.components.schemas.Link);
  assert.ok(specification.components.schemas.HypermediaLinks);
  for (const schemaName of ['Province', 'District', 'Substation', 'Installation', 'Reading', 'DistrictSummary']) {
    assert.ok(specification.components.schemas[schemaName].properties._links, `${schemaName} must expose hypermedia controls`);
  }
  for (const schemaName of ['ProvinceCollection', 'DistrictCollection', 'SubstationCollection', 'InstallationCollection']) {
    assert.ok(specification.components.schemas[schemaName].properties._links, `${schemaName} must expose collection navigation`);
  }
  assert.ok(specification.components.schemas.UserToken.properties._links);
  assert.ok(specification.components.schemas.DeviceToken.properties._links);
});
