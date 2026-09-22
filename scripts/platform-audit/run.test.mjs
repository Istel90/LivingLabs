import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './run.mjs';
test('rejects upstream outages and HTML masquerading as API success', () => {
  for (const status of [401, 404, 429, 500, 502, 503, 530]) assert.throws(() => validate('health', status, '', '{}'));
  assert.throws(() => validate('health', 200, 'text/html', '<html>error</html>'));
  assert.throws(() => validate('health', 200, '', '{"ok":true,"ready":false}'));
  assert.throws(() => validate('json', 200, '', '{}'));
  assert.throws(() => validate('version', 200, '', '{"error":"unavailable"}'));
});
test('accepts ready database and versioned served build', () => {
  validate('health', 200, 'application/json', '{"ok":true,"ready":true}');
  validate('version', 200, 'application/json', '{"version":"123"}');
  validate('html', 200, 'text/html', '<html lang="ko"></html>');
});
