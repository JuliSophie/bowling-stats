import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isCompatibleCatalog, setTrashTalkCatalog, getTrashTalkCatalog, selectTrashTalkV3 } from './trash-talk-v3.ts';
import { loadTsModule } from './legacy-test-support.mjs';

const source = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));
for (const pool of source.scenarios) {
  pool.templateIds ??= pool.templates.map(text =>
    `base:${createHash('sha256').update(`${pool.id}\0${text}`).digest('hex').slice(0, 24)}`);
}

test('malformed consolidated payloads reject without throwing or replacing the last good cache', () => {
  assert.equal(isCompatibleCatalog(source), true);
  setTrashTalkCatalog(source);
  const mutations = {
    kind: c => { c.scenarios[0].kind = 123; },
    messages: c => { c.legacyV2.messages = {}; },
    unknownCondition: c => { c.legacyV2.messages[0].conditions = { minimumScoreTypo: 999 }; },
    tone: c => { c.legacyV2.messages[0].tone = []; },
    duplicateId: c => { c.legacyV2.messages[1].id = c.legacyV2.messages[0].id; },
    emptyScenario: c => { c.legacyV2.messages[0].scenario = ''; },
    missingReference: c => { c.legacyV2.messages[0].poolId = 'missing'; },
    wrongReference: c => { c.legacyV2.messages[0].poolId = c.scenarios[0].id; },
    duplicateReference: c => { c.legacyV2.messages[1].poolId = c.legacyV2.messages[0].poolId; },
    incompleteReference: c => { c.legacyV2.messages.pop(); },
    parameters: c => { c.scenarios.find(s => s.kind === 'legacy-v1').legacyParameters = {}; },
    metadata: c => { c.scenarios.find(s => s.kind === 'legacy-v2-message').legacyMetadata = []; },
    missingEnvelope: c => { delete c.legacyV2; },
    extraEnvelopeField: c => { c.legacyV2.extra = []; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const catalog = structuredClone(source);
    mutate(catalog);
    assert.equal(isCompatibleCatalog(catalog), false, label);
    assert.throws(() => setTrashTalkCatalog(catalog), /Inkompatibler/, label);
    assert.equal(getTrashTalkCatalog(), source, label);
  }
  const optional = structuredClone(source);
  delete optional.legacyV2.messages[0].conditions;
  assert.equal(isCompatibleCatalog(optional), true);
});

test('mixed releases reject in both directions and a legacy kind cannot impersonate V3', () => {
  const old = { version: '3.0.0', language: 'de', scenarios: source.scenarios.filter(s => !s.kind) };
  assert.equal(isCompatibleCatalog(old), false);
  // The shipped pre-migration client gates on this exact version before installing a catalog.
  const oldClientAcceptsVersion = catalog => catalog.version === '3.0.0' && catalog.language === 'de';
  assert.equal(oldClientAcceptsVersion(old), true);
  assert.equal(oldClientAcceptsVersion(source), false);
  assert.equal(isCompatibleCatalog({ ...old, version: '3.1.0' }), false);
  const catalog = structuredClone(source);
  const impostor = catalog.scenarios.find(s => s.kind === 'legacy-v1');
  catalog.scenarios = catalog.scenarios.filter(s => s.kind);
  impostor.id = 'score.absolute.legendary';
  assert.equal(isCompatibleCatalog(catalog), true);
  assert.equal(selectTrashTalkV3({ scope: 'score', score: 250 }, catalog), null);
});

test('an exhausted message installs successfully and falls back to complete fragments', () => {
  const catalog = structuredClone(source);
  const accessor = loadTsModule(new URL('./legacy-catalog.ts', import.meta.url), () => ({ getTrashTalkCatalog }));
  const v2 = loadTsModule(new URL('./trash-talk-v2/engine.ts', import.meta.url), name =>
    name.endsWith('legacy-catalog') ? accessor : { getTrashTalkCatalog });
  const record = catalog.legacyV2.messages.find(item => item.scenario === 'score.absolute.legendary');
  for (const fragment of catalog.legacyV2.fragments.filter(item => item.scenario === record.scenario)) {
    for (const [field, text] of [['openersPoolId', ''], ['coresPoolId', 'SYNTHETIC FRAGMENT'], ['suffixesPoolId', '']]) {
      const component = catalog.scenarios.find(item => item.id === fragment[field]);
      component.templates = [text];
      component.templateIds = [`test:${component.id}`];
    }
  }
  const context = v2.buildScoreContext(250, 'Synthetic');
  const options = { seed: 'empty-message', maxIntensity: 5, preferFragments: true };
  setTrashTalkCatalog(catalog);
  const fragment = v2.selectTrashTalkV2(context, options);
  assert.equal(fragment, 'SYNTHETIC FRAGMENT.');
  for (const message of catalog.legacyV2.messages.filter(item => item.scenario === record.scenario)) {
    const pool = catalog.scenarios.find(item => item.id === message.poolId);
    pool.templates = [];
    pool.templateIds = [];
  }
  setTrashTalkCatalog(catalog);
  assert.equal(getTrashTalkCatalog(), catalog);
  assert.equal(v2.selectTrashTalkV2(context, { ...options, preferFragments: false }), fragment);
});
