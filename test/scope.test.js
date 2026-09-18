import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeClause } from '../src/utils/scope.js';

test('national users receive an unrestricted scope predicate', () => {
  const params = [];
  assert.equal(scopeClause({ role: 'national' }, params), 'TRUE');
  assert.deepEqual(params, []);
});

test('province users are bound to their province inside SQL', () => {
  const params = ['existing'];
  assert.equal(scopeClause({ role: 'province', provinceId: 'province-1' }, params), 'p.id = ?');
  assert.deepEqual(params, ['existing', 'province-1']);
});

test('district users are bound to their district inside SQL', () => {
  const params = [];
  assert.equal(scopeClause({ role: 'district', districtId: 'district-1' }, params), 'd.id = ?');
  assert.deepEqual(params, ['district-1']);
});
