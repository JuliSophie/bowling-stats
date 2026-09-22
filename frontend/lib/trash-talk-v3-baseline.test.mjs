import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Recovered from the five successful catalog patches preceding the legacy migration
// on 2026-09-18, not generated from the migrated catalog.
const originalCoreHash = '26f2faf11250ccf193806b601e22686801ab7bf1f1b75075ac9e8ddb7907114e';

const catalog = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));
const revision = JSON.parse(readFileSync(new URL('../../testdata/live-commentary-content-revision.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the reversible live-content revision preserves the original 37/127 historical baseline', () => {
  const byId = new Map(catalog.scenarios.map(scenario => [scenario.id, scenario]));
  const originals = new Map(revision.originalReplacedPools.map(scenario => [scenario.id, scenario]));
  const core = revision.originalCoreIds.map(id => originals.get(id) ?? byId.get(id));
  assert.equal(core.length, 37);
  assert.equal(core.reduce((sum, scenario) => sum + scenario.templates.length, 0), 127);
  assert.equal(revision.originalCoreHash, originalCoreHash);
  assert.equal(hash(core), originalCoreHash);
});

test('current core differs only by the explicit reviewed live-content revision', () => {
  const core = catalog.scenarios.filter(scenario => scenario.kind === undefined);
  assert.deepEqual(core.map(scenario => scenario.id),
    [...revision.originalCoreIds, ...revision.addedScenarioIds]);
  const changed = [...revision.originalReplacedPools.map(scenario => scenario.id), ...revision.addedScenarioIds];
  assert.deepEqual(Object.keys(revision.reviewedCurrentHashes), changed);
  for (const id of changed) {
    assert.equal(hash(core.find(scenario => scenario.id === id)), revision.reviewedCurrentHashes[id], id);
  }
});
