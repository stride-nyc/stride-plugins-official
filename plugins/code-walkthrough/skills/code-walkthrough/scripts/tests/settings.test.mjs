import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as settings from '../lib/settings.mjs';

const skill = new URL('../../', import.meta.url).pathname;

// A setting nothing reads changes nothing when it is edited. The test helpers count: BUDGET_MS is theirs.
test('every setting is read outside settings.mjs', () => {
  const files = ['scripts', 'scripts/lib', 'scripts/tests', 'assets'].flatMap(d =>
    fs.readdirSync(path.join(skill, d)).filter(f => /\.m?js$/.test(f) && f !== 'settings.mjs').map(f => path.join(skill, d, f)));
  const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  assert.deepEqual(Object.keys(settings).filter(k => !new RegExp(`\\b${k}\\b`).test(text)), []);
});
