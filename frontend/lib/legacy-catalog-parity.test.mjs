import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule, digest, poolCases, wrapperDigest } from './legacy-test-support.mjs';

const source = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../../testdata/legacy-catalog-golden.json', import.meta.url), 'utf8'));

function runtime() {
  let active = null;
  const core = { getTrashTalkCatalog: () => active, selectTrashTalkV3: () => null };
  const accessors = loadTsModule(new URL('./legacy-catalog.ts', import.meta.url), name => {
    if (name.endsWith('trash-talk-v3')) return core;
    throw new Error(`Unexpected import ${name}`);
  });
  const texts = loadTsModule(new URL('./trash-talk-texts.ts', import.meta.url), name => {
    if (name.endsWith('legacy-catalog')) return accessors;
    throw new Error(`Unexpected import ${name}`);
  });
  const v2 = loadTsModule(new URL('./trash-talk-v2/engine.ts', import.meta.url), name => {
    if (name.endsWith('trash-talk-v3')) return core;
    if (name.endsWith('legacy-catalog')) return accessors;
    throw new Error(`Unexpected import ${name}`);
  });
  const wrapper = loadTsModule(new URL('./trash-talk.ts', import.meta.url), name => {
    if (name === './trash-talk-texts') return texts;
    if (name === './trash-talk-v3') return core;
    if (name === './trash-talk-v2/engine') return v2;
    throw new Error(`Unexpected import ${name}`);
  });
  return { texts, v2, wrapper, setCatalog: value => { active = value; } };
}

test('all 160 original V1 pools preserve 909 texts and every dynamic formatting case', () => {
  const app = runtime();
  app.setCatalog(source);
  assert.equal(golden.v1.length, 160);
  assert.equal(golden.v1.reduce((sum, pool) => sum + pool.count, 0), 909);
  for (const expected of golden.v1) {
    const pool = app.texts[expected.exportName][expected.poolName];
    const arrays = expected.arity === null ? [pool] : poolCases(expected.types).map(args => pool(...args));
    assert.equal(arrays[0].length, expected.count, `${expected.exportName}.${expected.poolName}: occurrence count`);
    assert.equal(digest(arrays), expected.hash, `${expected.exportName}.${expected.poolName}: text or formatter changed`);
    if (expected.arity !== null) assert.equal(pool.length, expected.arity, `${expected.exportName}.${expected.poolName}: signature changed`);
  }
});

test('all 36 wrapper functions preserve 8318 baseline boundary outputs and scales', () => {
  const app = runtime();
  app.setCatalog(source);
  const actual = wrapperDigest(app.wrapper);
  assert.equal(Object.keys(actual).length, 36);
  for (const [name, expected] of Object.entries(golden.wrapper)) {
    assert.deepEqual(actual[name], expected, `${name}: changed loaded-catalog legacy output`);
  }
});

test('all V2 metadata and 1331 component strings retain exact content and order', () => {
  const byId = new Map(source.scenarios.map(item => [item.id, item]));
  assert.equal(source.legacyV2.messages.length, 15);
  assert.equal(source.legacyV2.fragments.length, 88);
  source.legacyV2.messages.forEach(({ poolId, ...metadata }, index) => {
    assert.deepEqual(metadata, golden.v2.metadata.messages[index].metadata);
    assert.equal(digest(byId.get(poolId).templates), golden.v2.metadata.messages[index].templateHash);
  });
  source.legacyV2.fragments.forEach(({ openersPoolId, coresPoolId, suffixesPoolId, ...metadata }, index) => {
    const expected = golden.v2.metadata.fragments[index];
    assert.deepEqual(metadata, expected.metadata);
    assert.equal(digest(byId.get(openersPoolId).templates), expected.openersHash);
    assert.equal(digest(byId.get(coresPoolId).templates), expected.coresHash);
    assert.equal(digest(byId.get(suffixesPoolId).templates), expected.suffixesHash);
  });
});

test('V2 weighted selection, tone, intensity and fragment preference match 20232 baseline cases', () => {
  const app = runtime();
  app.setCatalog(source);
  assert.equal(golden.v2.contexts.length, 3372);
  for (const expected of golden.v2.results) {
    const actual = golden.v2.contexts.map(context => app.v2.selectTrashTalkV2(context, expected.option));
    assert.equal(digest(actual), expected.hash, `V2 selection changed: ${JSON.stringify(expected.option)}`);
  }
});

test('getters recover after cold catalog load and disabled V1 entries are not resurrected', () => {
  const app = runtime();
  const meta = source.scenarios.find(item => item.kind === 'legacy-v1' && item.legacyParameters.length === 0);
  assert.equal(app.texts[meta.legacyExport][meta.legacyPool].length, 0);
  assert.equal(app.wrapper.scoreBenchmark(180).detail, '');
  app.setCatalog(source);
  assert.equal(app.texts[meta.legacyExport][meta.legacyPool].length, meta.templates.length);
  const disabled = structuredClone(source);
  disabled.scenarios.find(item => item.id === meta.id).enabled = false;
  app.setCatalog(disabled);
  assert.equal(app.texts[meta.legacyExport][meta.legacyPool].length, 0);
});

test('new V2 message variants can be selected without changing metadata group weights', () => {
  const app = runtime();
  const catalog = structuredClone(source);
  const metadata = catalog.legacyV2.messages.find(item => item.scenario === 'score.absolute.legendary');
  const pool = catalog.scenarios.find(item => item.id === metadata.poolId);
  const competitor = {
    ...structuredClone(pool), id: 'legacy.v2.message.synthetic-competitor',
    templates: ['SYNTHETIC COMPETITOR'], templateIds: ['legacy:synthetic-competitor'],
  };
  catalog.scenarios.push(competitor);
  catalog.legacyV2.messages.push({ ...metadata, id: 'synthetic-competitor', poolId: competitor.id });
  app.setCatalog(catalog);
  const context = app.v2.buildScoreContext(250, 'Synthetic');
  const options = Array.from({ length: 512 }, (_, i) => ({ seed: `variant-${i}`, maxIntensity: 5, preferFragments: false }));
  const before = options.map(option => app.v2.selectTrashTalkV2(context, option));
  pool.templates.push('SYNTHETIC GENERATED VARIANT');
  pool.templateIds.push('gen:synthetic-variant');
  const after = options.map(option => app.v2.selectTrashTalkV2(context, option));
  assert.ok(after.includes('SYNTHETIC GENERATED VARIANT'), 'Generated variants must not be ignored after templates[0]');
  assert.deepEqual(after.map(value => value === 'SYNTHETIC COMPETITOR'), before.map(value => value === 'SYNTHETIC COMPETITOR'),
    'Adding a variant must not increase its metadata group weight');
});

test('empty component members are valid but empty disabled pools cannot make incomplete sentences', () => {
  const app = runtime();
  const catalog = structuredClone(source);
  const metadata = catalog.legacyV2.fragments.find(item => item.scenario === 'score.absolute.legendary');
  const core = catalog.scenarios.find(item => item.id === metadata.coresPoolId);
  const suffix = catalog.scenarios.find(item => item.id === metadata.suffixesPoolId);
  app.setCatalog(catalog);
  const context = app.v2.buildScoreContext(250, 'Synthetic');
  const message = app.v2.selectTrashTalkV2(context, { seed: 'parts', maxIntensity: 5, preferFragments: false });
  suffix.templates = [''];
  suffix.templateIds = ['legacy:empty-suffix'];
  const fragment = app.v2.selectTrashTalkV2(context, { seed: 'parts', maxIntensity: 5, preferFragments: true });
  assert.ok(fragment);
  assert.notEqual(fragment, message);
  core.templates = [];
  core.templateIds = [];
  assert.equal(app.v2.selectTrashTalkV2(context, { seed: 'parts', maxIntensity: 5, preferFragments: true }), message);
});
